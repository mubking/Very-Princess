/**
 * @file indexerService.ts
 * @description Background indexer service for syncing blockchain data.
 * 
 * This service runs as a cron job to continuously sync blockchain data
 * independent of HTTP requests, ensuring the backend always has the latest
 * contract state.
 */

import * as cron from 'node-cron';
import { RPC_URL, CONTRACT_ID } from '../config/env.js';
import { stellarService } from './stellarService.js';

export class IndexerService {
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;

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
   * Sync blockchain data by fetching the latest contract state
   */
  private async syncBlockchainData(): Promise<void> {
    try {
      console.log('Starting blockchain data sync...');
      
      if (!CONTRACT_ID) {
        console.warn('No CONTRACT_ID configured, skipping sync');
        return;
      }

      // Fetch latest contract data
      const contractData = await stellarService.getContractState(CONTRACT_ID);
      
      // Here you would typically:
      // 1. Update your database with the latest contract state
      // 2. Process any new events
      // 3. Update caches
      // 4. Trigger any necessary webhook notifications
      
      console.log('Blockchain data sync completed successfully');
      console.log(`Synced ${JSON.stringify(contractData).length} bytes of contract data`);
      
    } catch (error) {
      console.error('Error during blockchain data sync:', error);
      // In a production environment, you might want to:
      // 1. Send alerts to monitoring systems
      // 2. Implement retry logic with exponential backoff
      // 3. Log detailed error information for debugging
    }
  }

  /**
   * Get the current status of the indexer
   */
  getStatus(): { isRunning: boolean; lastSync?: Date } {
    return {
      isRunning: this.isRunning,
      // In a real implementation, you'd track the last sync time
      lastSync: new Date() // Placeholder
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
