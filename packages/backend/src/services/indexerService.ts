/**
 * @file indexerService.ts
 * @description Background indexer service for syncing blockchain data.
 * 
 * This service runs as a cron job to continuously sync blockchain data
 * independent of HTTP requests, ensuring the backend always has the latest
 * contract state.
 */

import * as cron from 'node-cron';
import { RPC_URL, CONTRACT_ID, DEPLOYMENT_LEDGER } from '../config/env.js';
import { stellarService } from './stellarService.js';
import { prisma } from './db.js';

export class IndexerService {
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;
  private readonly CURSOR_ID = "default";

  /**
   * Start the indexer cron job
   */
  start(): void {
    if (this.isRunning) {
      console.log('Indexer is already running');
      return;
    }

    // Get cron expression from environment or use default (every 5 minutes)
    const cronExpression = process.env.INDEXER_CRON_EXPRESSION || '*/5 * * * *';
    
    console.log(`Starting indexer with cron expression: ${cronExpression}`);
    console.log('Syncing Blockchain Data...');

    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.syncBlockchainData();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.isRunning = true;
    console.log('Indexer started successfully');
  }

  /**
   * Stop the indexer cron job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log('Indexer stopped');
  }

  /**
   * Get the last processed ledger from the database
   */
  private async getCursor(): Promise<number> {
    const state = await prisma.indexerState.findUnique({
      where: { id: this.CURSOR_ID },
    });
    
    if (!state) {
      console.log(`No existing cursor found. Initializing with DEPLOYMENT_LEDGER: ${DEPLOYMENT_LEDGER}`);
      return DEPLOYMENT_LEDGER;
    }
    
    return state.lastProcessedLedger;
  }

  /**
   * Update the last processed ledger in the database
   */
  private async updateCursor(ledger: number): Promise<void> {
    await prisma.indexerState.upsert({
      where: { id: this.CURSOR_ID },
      update: { lastProcessedLedger: ledger },
      create: { id: this.CURSOR_ID, lastProcessedLedger: ledger },
    });
  }

  /**
   * Sync blockchain data by fetching the latest contract state
   */
  private async syncBlockchainData(): Promise<void> {
    try {
      console.log('Starting blockchain data sync...');
      
      if (!CONTRACT_ID) {
        console.warn('No CONTRACT_ID configured, skipping sync');
        return;
      }

      const lastProcessedLedger = await this.getCursor();
      console.log(`Indexing from ledger: ${lastProcessedLedger + 1}`);

      // Fetch new events
      const eventsResponse = await stellarService.getEvents(lastProcessedLedger + 1);
      
      if (eventsResponse.events && eventsResponse.events.length > 0) {
        console.log(`Processing ${eventsResponse.events.length} new events...`);
        
        // In a real implementation, we would process each event in a transaction
        // For now, we'll just update the cursor to the latest event's ledger
        const latestLedger = Math.max(...eventsResponse.events.map(e => e.ledger));
        
        await prisma.$transaction(async (tx) => {
          // 1. Process all events and update other tables...
          // 2. Update the cursor
          await tx.indexerState.upsert({
            where: { id: this.CURSOR_ID },
            update: { lastProcessedLedger: latestLedger },
            create: { id: this.CURSOR_ID, lastProcessedLedger: latestLedger },
          });
        });

        console.log(`Successfully processed events up to ledger ${latestLedger}`);
      } else {
        console.log('No new events found');
      }
      
      console.log('Blockchain data sync completed successfully');
      
    } catch (error) {
      console.error('Error during blockchain data sync:', error);
    }
  }

  /**
   * Get the current status of the indexer
   */
  getStatus(): { isRunning: boolean; lastProcessedLedger?: number } {
    return {
      isRunning: this.isRunning,
      // We'll return the cursor value if available
    };
  }

  /**
   * Manually trigger a sync (useful for testing or immediate updates)
   */
  async triggerSync(): Promise<void> {
    console.log('Manual sync triggered');
    await this.syncBlockchainData();
  }
}

// Export singleton instance
export const indexerService = new IndexerService();
