// Queue System Entry Point
// This file demonstrates how to integrate the queue system into the main application

const queueManager = require('./queue_manager');

/**
 * Initialize the queue system
 * Call this during application startup
 */
async function initializeQueue() {
    console.log('🚀 Starting Bouncer Queue System...');
    
    try {
        const success = await queueManager.initialize();
        
        if (success) {
            console.log('✅ Bouncer Queue System started successfully');
            console.log('📊 Queue Status:', await queueManager.getStatus());
            return true;
        } else {
            console.error('❌ Failed to start Bouncer Queue System');
            return false;
        }
        
    } catch (error) {
        console.error('💥 Error starting queue system:', error);
        return false;
    }
}

/**
 * Shutdown the queue system
 * Call this during application shutdown
 */
async function shutdownQueue() {
    console.log('🛑 Shutting down Bouncer Queue System...');
    
    try {
        const success = await queueManager.shutdown();
        
        if (success) {
            console.log('✅ Bouncer Queue System shutdown successfully');
        } else {
            console.error('❌ Error during queue system shutdown');
        }
        
        return success;
        
    } catch (error) {
        console.error('💥 Error shutting down queue system:', error);
        return false;
    }
}

/**
 * Get current queue status for monitoring
 */
async function getQueueStatus() {
    try {
        const status = await queueManager.getStatus();
        return status;
    } catch (error) {
        console.error('Error getting queue status:', error);
        return null;
    }
}

// Export functions for integration
module.exports = {
    initializeQueue,
    shutdownQueue,
    getQueueStatus,
    queueManager
};