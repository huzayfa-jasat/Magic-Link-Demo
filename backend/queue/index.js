// Queue Imports
const queueManager = require('./queue_manager');

/**
 * Initialize the queue system
 * - Called during application startup
 */
async function initializeQueue() {
    // console.log('🚀 Starting Bouncer Queue System...');
    
    try {
        const success = await queueManager.initialize();
        
        if (success) {
            // console.log('✅ Bouncer Queue System started successfully');
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
 * - Called during application shutdown
 */
async function shutdownQueue() {
    // console.log('🛑 Shutting down Bouncer Queue System...');
    
    try {
        // Shutdown queue
        const success = await queueManager.shutdown();
        if (success) console.log('✅ Bouncer Queue System shutdown successfully');
        else console.error('❌ Error during queue system shutdown');
        
        // Return
        return success;
        
    } catch (error) {
        console.error('💥 Error shutting down queue system:', error);
        return false;
    }
}

/**
 * Get current queue status
 * - Used for queue system status
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

// Exports
module.exports = {
    initializeQueue,
    shutdownQueue,
    getQueueStatus,
    queueManager
};