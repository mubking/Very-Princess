#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Symbol, Vec,
};

// ─────────────────────────────────────────────────────────────────────────────
// Data Types
// ─────────────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Organization {
    pub id: Symbol,
    pub name: String,
    pub admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Maintainer {
    pub address: Address,
    pub org_id: Symbol,
}

/// Represents a single payout entry in a batch allocation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayoutParams {
    pub maintainer: Address,
    pub amount: i128,
}

#[contracttype]
pub enum DataKey {
    /// The global Stellar Asset Contract address configured during initialization.
    Token,
    Organization(Symbol),
    OrgAdmin(Symbol),
    OrgMaintainers(Symbol),
    MaintainerOrg(Address),
    MaintainerBalance(Address),
    /// Total budget currently held by this org (in stroops).
    OrgBudget(Symbol),
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

#[contract]
pub struct PayoutRegistry;

#[contractimpl]
impl PayoutRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────────────────────────────────────

    pub fn init(env: Env, token: Address) {
        if env.storage().persistent().has(&DataKey::Token) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&DataKey::Token, &token);
    }

    pub fn get_token(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Token)
            .expect("contract not initialized")
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Organisation Management & Funding
    // ─────────────────────────────────────────────────────────────────────────

    pub fn register_org(env: Env, id: Symbol, name: String, admin: Address) {
        admin.require_auth();

        let org_key = DataKey::Organization(id.clone());

        if env.storage().persistent().has(&org_key) {
            panic!("organization already registered");
        }

        let org = Organization {
            id: id.clone(),
            name,
            admin: admin.clone(),
        };
        env.storage().persistent().set(&org_key, &org);

        env.storage()
            .persistent()
            .set(&DataKey::OrgAdmin(id.clone()), &admin);

        let empty_list: Vec<Address> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&DataKey::OrgMaintainers(id.clone()), &empty_list);

        env.storage()
            .persistent()
            .set(&DataKey::OrgBudget(id.clone()), &0_i128);

        env.events()
            .publish((symbol_short!("registry"), symbol_short!("org_added")), id);
    }

    pub fn get_org(env: Env, id: Symbol) -> Organization {
        env.storage()
            .persistent()
            .get(&DataKey::Organization(id))
            .expect("organization not found")
    }

    pub fn fund_org(env: Env, org_id: Symbol, from: Address, amount: i128) {
        from.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        if !env
            .storage()
            .persistent()
            .has(&DataKey::OrgAdmin(org_id.clone()))
        {
            panic!("organization not found");
        }

        let token = Self::get_token(env.clone());
        let token_client = token::Client::new(&env, &token);

        token_client.transfer(&from, &env.current_contract_address(), &amount);

        let budget_key = DataKey::OrgBudget(org_id.clone());
        let current_budget: i128 = env.storage().persistent().get(&budget_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&budget_key, &(current_budget + amount));

        env.events().publish(
            (symbol_short!("registry"), symbol_short!("funded")),
            (org_id, from, amount),
        );
    }

    pub fn get_org_budget(env: Env, id: Symbol) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::OrgBudget(id))
            .unwrap_or(0_i128)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Maintainer Management
    // ─────────────────────────────────────────────────────────────────────────

    pub fn add_maintainer(env: Env, org_id: Symbol, maintainer: Address) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::OrgAdmin(org_id.clone()))
            .expect("organization not found");
        admin.require_auth();

        if env
            .storage()
            .persistent()
            .has(&DataKey::MaintainerOrg(maintainer.clone()))
        {
            panic!("maintainer already registered");
        }

        env.storage()
            .persistent()
            .set(&DataKey::MaintainerOrg(maintainer.clone()), &org_id);

        env.storage()
            .persistent()
            .set(&DataKey::MaintainerBalance(maintainer.clone()), &0_i128);

        let maintainer_list_key = DataKey::OrgMaintainers(org_id.clone());
        let mut maintainers: Vec<Address> = env
            .storage()
            .persistent()
            .get(&maintainer_list_key)
            .unwrap_or_else(|| Vec::new(&env));
        maintainers.push_back(maintainer.clone());
        env.storage()
            .persistent()
            .set(&maintainer_list_key, &maintainers);

        env.events().publish(
            (symbol_short!("registry"), symbol_short!("mnt_added")),
            (org_id, maintainer),
        );
    }

    pub fn get_maintainer(env: Env, address: Address) -> Maintainer {
        let org_id: Symbol = env
            .storage()
            .persistent()
            .get(&DataKey::MaintainerOrg(address.clone()))
            .expect("maintainer not registered");
        Maintainer { address, org_id }
    }

    pub fn get_maintainers(env: Env, org_id: Symbol) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::OrgMaintainers(org_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Payout Allocation & Claiming
    // ─────────────────────────────────────────────────────────────────────────

    pub fn allocate_payout(env: Env, org_id: Symbol, maintainer: Address, amount: i128) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::OrgAdmin(org_id.clone()))
            .expect("organization not found");
        admin.require_auth();

        if amount <= 0 {
            panic!("payout amount must be positive");
        }

        let maintainer_org: Symbol = env
            .storage()
            .persistent()
            .get(&DataKey::MaintainerOrg(maintainer.clone()))
            .expect("maintainer not registered");
        if maintainer_org != org_id {
            panic!("maintainer does not belong to this organization");
        }

        let budget_key = DataKey::OrgBudget(org_id.clone());
        let current_budget: i128 = env.storage().persistent().get(&budget_key).unwrap_or(0);
        if current_budget < amount {
            panic!("insufficient organization budget");
        }

        env.storage()
            .persistent()
            .set(&budget_key, &(current_budget - amount));

        let balance_key = DataKey::MaintainerBalance(maintainer.clone());
        let current_balance: i128 = env
            .storage()
            .persistent()
            .get(&balance_key)
            .unwrap_or(0_i128);
        let new_balance = current_balance + amount;
        env.storage().persistent().set(&balance_key, &new_balance);

        env.events().publish(
            (symbol_short!("payout"), symbol_short!("allocated")),
            (org_id, maintainer, amount),
        );
    }

    /// Allocate payouts to multiple maintainers in a single transaction.
    ///
    /// Admin auth is required only once for the entire batch.
    /// The total sum of all payouts must not exceed the organization's current budget.
    /// Maximum batch size is 100 entries to stay within Soroban CPU/instruction limits.
    pub fn batch_allocate(
        env: Env,
        admin: Address,
        org_id: Symbol,
        payouts: Vec<PayoutParams>,
    ) {
        // Require admin auth once for the entire batch
        admin.require_auth();

        // Verify caller is the registered admin for this org
        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::OrgAdmin(org_id.clone()))
            .expect("organization not found");
        if stored_admin != admin {
            panic!("caller is not the organization admin");
        }

        // Enforce batch size limit to prevent out-of-gas errors
        if payouts.len() > 100 {
            panic!("batch size exceeds maximum of 100");
        }

        if payouts.is_empty() {
            panic!("payouts list must not be empty");
        }

        // Compute total payout sum and validate each entry before touching storage
        let mut total: i128 = 0_i128;
        for i in 0..payouts.len() {
            let entry = payouts.get(i).unwrap();
            if entry.amount <= 0 {
                panic!("payout amount must be positive");
            }
            let maintainer_org: Symbol = env
                .storage()
                .persistent()
                .get(&DataKey::MaintainerOrg(entry.maintainer.clone()))
                .expect("maintainer not registered");
            if maintainer_org != org_id {
                panic!("maintainer does not belong to this organization");
            }
            total += entry.amount;
        }

        // Verify the org has enough budget to cover the entire batch
        let budget_key = DataKey::OrgBudget(org_id.clone());
        let current_budget: i128 = env.storage().persistent().get(&budget_key).unwrap_or(0);
        if current_budget < total {
            panic!("insufficient organization budget for batch");
        }

        // Deduct total from org budget in one write
        env.storage()
            .persistent()
            .set(&budget_key, &(current_budget - total));

        // Accumulate each maintainer's claimable balance
        for i in 0..payouts.len() {
            let entry = payouts.get(i).unwrap();
            let balance_key = DataKey::MaintainerBalance(entry.maintainer.clone());
            let current_balance: i128 = env
                .storage()
                .persistent()
                .get(&balance_key)
                .unwrap_or(0_i128);
            env.storage()
                .persistent()
                .set(&balance_key, &(current_balance + entry.amount));
        }

        // Emit a single batch_allocated event
        env.events().publish(
            (symbol_short!("payout"), symbol_short!("batch_alc")),
            (org_id, admin, total),
        );
    }

    pub fn get_claimable_balance(env: Env, maintainer: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::MaintainerBalance(maintainer))
            .unwrap_or(0_i128)
    }

    pub fn claim_payout(env: Env, maintainer: Address) -> i128 {
        maintainer.require_auth();

        let balance_key = DataKey::MaintainerBalance(maintainer.clone());
        let claimable: i128 = env
            .storage()
            .persistent()
            .get(&balance_key)
            .unwrap_or(0_i128);

        if claimable == 0 {
            panic!("no claimable balance");
        }

        // Reset balance BEFORE transfer (Checks-Effects-Interactions)
        env.storage().persistent().set(&balance_key, &0_i128);

        let token = Self::get_token(env.clone());
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &maintainer, &claimable);

        env.events().publish(
            (symbol_short!("payout"), symbol_short!("claimed")),
            (maintainer, claimable),
        );

        claimable
    }
}
#[cfg(test)]
mod tests;