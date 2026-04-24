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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaintainerPayout {
    pub amount: i128,
    pub unlock_timestamp: u64,
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

    /// Initialize the contract with a single global token (e.g. USDC or XLM).
    /// This can only be called once.
    pub fn init(env: Env, token: Address) {
        if env.storage().persistent().has(&DataKey::Token) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&DataKey::Token, &token);
    }

    /// Retrieve the global token address.
    ///
    /// # Panics
    /// If the contract has not been initialized.
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

        env.events().publish(
    (Symbol::new(&env, "VeryPrincess"), Symbol::new(&env, "OrgRegistered")),
    id,
);
    }

    pub fn get_org(env: Env, id: Symbol) -> Organization {
        env.storage()
            .persistent()
            .get(&DataKey::Organization(id))
            .expect("organization not found")
    }

    /// Fund an organization's budget.
    ///
    /// Anyone can deposit tokens into the registry earmarked for an organization.
    /// The tokens are transferred from `from` to the contract's address.
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
    (Symbol::new(&env, "VeryPrincess"), Symbol::new(&env, "OrgFunded")),
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
            .set(&DataKey::MaintainerBalance(maintainer.clone()), &MaintainerPayout { amount: 0, unlock_timestamp: 0 });

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
    (Symbol::new(&env, "VeryPrincess"), Symbol::new(&env, "MaintainerAdded")),
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

    pub fn allocate_payout(env: Env, org_id: Symbol, maintainer: Address, amount: i128, unlock_timestamp: u64) {
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

        // Check if there is enough budget
        let budget_key = DataKey::OrgBudget(org_id.clone());
        let current_budget: i128 = env.storage().persistent().get(&budget_key).unwrap_or(0);
        if current_budget < amount {
            panic!("insufficient organization budget");
        }

        // Deduct from OrgBudget
        env.storage()
            .persistent()
            .set(&budget_key, &(current_budget - amount));

        // Accumulate the claimable balance.
        let balance_key = DataKey::MaintainerBalance(maintainer.clone());
        let mut current_payout: MaintainerPayout = env
            .storage()
            .persistent()
            .get(&balance_key)
            .unwrap_or(MaintainerPayout { amount: 0, unlock_timestamp: 0 });
        current_payout.amount += amount;
        current_payout.unlock_timestamp = unlock_timestamp;
        env.storage().persistent().set(&balance_key, &current_payout);

        env.events().publish(
    (Symbol::new(&env, "VeryPrincess"), Symbol::new(&env, "PayoutAllocated")),
    (org_id, maintainer, amount),
);
    }

    pub fn get_claimable_balance(env: Env, maintainer: Address) -> i128 {
        let payout: MaintainerPayout = env.storage()
            .persistent()
            .get(&DataKey::MaintainerBalance(maintainer))
            .unwrap_or(MaintainerPayout { amount: 0, unlock_timestamp: 0 });
        payout.amount
    }

    pub fn claim_payout(env: Env, maintainer: Address) -> i128 {
        maintainer.require_auth();

        let balance_key = DataKey::MaintainerBalance(maintainer.clone());
        let payout: MaintainerPayout = env
            .storage()
            .persistent()
            .get(&balance_key)
            .unwrap_or(MaintainerPayout { amount: 0, unlock_timestamp: 0 });

        if payout.amount == 0 {
            panic!("no claimable balance");
        }

        if env.ledger().timestamp() < payout.unlock_timestamp {
            panic!("payout is still locked");
        }

        // Reset the balance BEFORE the transfer (Checks-Effects-Interactions)
        env.storage().persistent().set(&balance_key, &MaintainerPayout { amount: 0, unlock_timestamp: 0 });

        // Perform token transfer to the maintainer
        let token = Self::get_token(env.clone());
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &maintainer, &payout.amount);

        env.events().publish(
    (Symbol::new(&env, "VeryPrincess"), Symbol::new(&env, "PayoutClaimed")),
    (maintainer, claimable),
);

        payout.amount
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{symbol_short, token, Env, String};

    // ── Test Helpers ─────────────────────────────────────────────────────────

    struct Setup {
        env: Env,
        client: PayoutRegistryClient<'static>,
        token_admin: Address,
        token: token::StellarAssetClient<'static>,
    }

    /// Create a fresh Env with mock auth, a token, and a deployed PayoutRegistry initialized.
    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        // Create a mock Stellar Asset token using SDK v21 compatible method
        let token_admin = Address::generate(&env);
        let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_client = token::StellarAssetClient::new(&env, &token_contract_id.address());

        // Register Registry
        let contract_id = env.register_contract(None, PayoutRegistry);
        let client = PayoutRegistryClient::new(&env, &contract_id);

        // Init Registry
        client.init(&token_contract_id.address());

        Setup {
            env,
            client,
            token_admin,
            token: token_client,
        }
    }

    fn register_test_org(env: &Env, client: &PayoutRegistryClient, org_sym: Symbol) -> Address {
        let admin = Address::generate(env);
        client.register_org(
            &org_sym,
            &String::from_str(env, "Test Organization"),
            &admin,
        );
        admin
    }

    #[test]
    fn test_init() {
        let Setup { env, client, .. } = setup();
        // Trying to init again should panic
        let additional_token = Address::generate(&env);
        // We use try_init so we can check the error
        let result = client.try_init(&additional_token);
        assert!(result.is_err());
    }

    #[test]
    fn test_register_and_get_org() {
        let Setup { env, client, .. } = setup();
        let org_sym = symbol_short!("myorg");
        let admin = register_test_org(&env, &client, org_sym.clone());

        let org = client.get_org(&org_sym);
        assert_eq!(org.id, org_sym);
        assert_eq!(org.admin, admin);
        assert_eq!(client.get_org_budget(&org_sym), 0);
    }

    #[test]
    fn test_fund_org() {
        let Setup {
            env,
            client,
            token,
            token_admin: _token_admin,
            ..
        } = setup();
        let org_sym = symbol_short!("myorg");
        register_test_org(&env, &client, org_sym.clone());

        let donor = Address::generate(&env);
        let token_client = token::Client::new(&env, &token.address);

        // Mint tokens to donor
        token.mint(&donor, &100_000_000);
        assert_eq!(token_client.balance(&donor), 100_000_000);

        // Fund org
        client.fund_org(&org_sym, &donor, &50_000_000);

        assert_eq!(client.get_org_budget(&org_sym), 50_000_000);
        // Verify tokens are in the contract
        assert_eq!(token_client.balance(&client.address), 50_000_000);
        assert_eq!(token_client.balance(&donor), 50_000_000);
    }

    #[test]
    #[should_panic(expected = "insufficient organization budget")]
    fn test_allocate_without_budget_panics() {
        let Setup { env, client, .. } = setup();
        let org_sym = symbol_short!("myorg");
        register_test_org(&env, &client, org_sym.clone());

        let maintainer = Address::generate(&env);
        client.add_maintainer(&org_sym, &maintainer);

        // Budget is zero, so this panics
        client.allocate_payout(&org_sym, &maintainer, &5_000_000_i128, &0);
    }

    #[test]
    fn test_allocate_and_claim_with_tokens() {
        let Setup {
            env, client, token, ..
        } = setup();
        let org_sym = symbol_short!("myorg");
        register_test_org(&env, &client, org_sym.clone());

        let maintainer = Address::generate(&env);
        client.add_maintainer(&org_sym, &maintainer);

        let donor = Address::generate(&env);
        let token_client = token::Client::new(&env, &token.address);
        token.mint(&donor, &20_000_000);

        client.fund_org(&org_sym, &donor, &20_000_000);

        // Allocate
        client.allocate_payout(&org_sym, &maintainer, &5_000_000_i128, &0);
        assert_eq!(client.get_claimable_balance(&maintainer), 5_000_000);
        assert_eq!(client.get_org_budget(&org_sym), 15_000_000); // 20M - 5M

        // Maintainer Claims
        assert_eq!(token_client.balance(&maintainer), 0);
        let claimed = client.claim_payout(&maintainer);
        assert_eq!(claimed, 5_000_000);

        // Assert token state
        assert_eq!(client.get_claimable_balance(&maintainer), 0);
        assert_eq!(token_client.balance(&maintainer), 5_000_000);
        assert_eq!(token_client.balance(&client.address), 15_000_000); // Only org budget left
    }

    #[test]
    #[should_panic(expected = "payout is still locked")]
    fn test_time_bound_payout_locked() {
        let Setup { env, client, token, .. } = setup();
        let org_sym = symbol_short!("myorg");
        register_test_org(&env, &client, org_sym.clone());

        let maintainer = Address::generate(&env);
        client.add_maintainer(&org_sym, &maintainer);

        let donor = Address::generate(&env);
        token.mint(&donor, &20_000_000);
        client.fund_org(&org_sym, &donor, &20_000_000);

        env.ledger().with_mut(|li| li.timestamp = 100);
        client.allocate_payout(&org_sym, &maintainer, &5_000_000_i128, &200);

        client.claim_payout(&maintainer);
    }

    #[test]
    fn test_time_bound_payout_unlocked() {
        let Setup { env, client, token, .. } = setup();
        let org_sym = symbol_short!("myorg");
        register_test_org(&env, &client, org_sym.clone());

        let maintainer = Address::generate(&env);
        client.add_maintainer(&org_sym, &maintainer);

        let donor = Address::generate(&env);
        token.mint(&donor, &20_000_000);
        client.fund_org(&org_sym, &donor, &20_000_000);

        env.ledger().with_mut(|li| li.timestamp = 100);
        client.allocate_payout(&org_sym, &maintainer, &5_000_000_i128, &200);

        env.ledger().with_mut(|li| li.timestamp = 201);
        let claimed = client.claim_payout(&maintainer);
        assert_eq!(claimed, 5_000_000);
    }
}
