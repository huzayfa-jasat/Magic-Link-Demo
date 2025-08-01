const knex = require('./backend/node_modules/knex')(require('./backend/knexfile.js').development);

async function checkBatch() {
  try {
    // Check all batches
    const batches = await knex('deliverable_batches')
      .select('id', 'title', 'status', 'total_emails', 'estimated_emails')
      .orderBy('id', 'desc')
      .limit(10);
    
    console.log('Recent batches:');
    batches.forEach(batch => {
      console.log(`Batch ${batch.id}: "${batch.title}" - Status: ${batch.status}, Total: ${batch.total_emails}, Estimated: ${batch.estimated_emails}`);
    });
    
    // Check emails in batch 8 specifically
    const batch8Emails = await knex('deliverable_email_batch_association')
      .where('batch_id', 8)
      .count('* as count')
      .first();
    
    console.log('\nBatch 8 email count:', batch8Emails.count);
    
    // Check emails in batch 9 specifically
    const batch9Emails = await knex('deliverable_email_batch_association')
      .where('batch_id', 9)
      .count('* as count')
      .first();
    
    console.log('Batch 9 email count:', batch9Emails.count);
    
    // Check user's credit balance
    const balance = await knex('deliverable_credits')
      .where('user_id', 1)
      .select('current_balance')
      .first();
    
    console.log('\nUser credit balance:', balance.current_balance);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await knex.destroy();
  }
}

checkBatch(); 