/**
 * Test Data Generator for Email Queue Test Suite
 * 
 * Generates realistic test data for email validation testing including:
 * - Valid and invalid email addresses
 * - Various domain types and formats
 * - Edge cases and special scenarios
 * - Bulk data sets for performance testing
 */

const crypto = require('crypto');

class TestDataGenerator {
    constructor() {
        // Common domains for realistic test data
        this.validDomains = [
            'gmail.com',
            'yahoo.com',
            'hotmail.com',
            'outlook.com',
            'example.com',
            'test.com',
            'company.org',
            'university.edu',
            'business.net'
        ];
        
        // Invalid domains for negative testing
        this.invalidDomains = [
            'invalid.fake',
            'nonexistent.domain',
            'bad-domain.invalid',
            'fake.test.invalid',
            'notreal.com.fake'
        ];
        
        // Common name prefixes
        this.nameComponents = {
            firstNames: [
                'john', 'jane', 'mike', 'sarah', 'david', 'emma', 'james', 'lisa',
                'robert', 'mary', 'william', 'patricia', 'richard', 'jennifer',
                'charles', 'elizabeth', 'thomas', 'maria', 'christopher', 'susan'
            ],
            lastNames: [
                'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia',
                'miller', 'davis', 'rodriguez', 'martinez', 'hernandez',
                'lopez', 'gonzalez', 'wilson', 'anderson', 'thomas', 'taylor',
                'moore', 'jackson', 'martin'
            ],
            adjectives: [
                'test', 'demo', 'sample', 'example', 'user', 'admin', 'support',
                'contact', 'info', 'sales', 'marketing', 'dev', 'qa', 'staging'
            ]
        };
        
        // Special characters for edge case testing
        this.specialCharacters = ['.', '_', '-', '+'];
        
        // Top-level domains for variety
        this.tlds = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'info'];
    }
    
    /**
     * Generate a random string of specified length
     */
    randomString(length = 8, charset = 'abcdefghijklmnopqrstuvwxyz0123456789') {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }
    
    /**
     * Generate a random valid email address
     */
    generateValidEmail() {
        const firstName = this.getRandomItem(this.nameComponents.firstNames);
        const lastName = this.getRandomItem(this.nameComponents.lastNames);
        const domain = this.getRandomItem(this.validDomains);
        
        // Various valid email formats
        const formats = [
            `${firstName}.${lastName}@${domain}`,
            `${firstName}${lastName}@${domain}`,
            `${firstName}_${lastName}@${domain}`,
            `${firstName}${Math.floor(Math.random() * 999)}@${domain}`,
            `${firstName}.${lastName}${Math.floor(Math.random() * 99)}@${domain}`
        ];
        
        return this.getRandomItem(formats);
    }
    
    /**
     * Generate a random invalid email address
     */
    generateInvalidEmail() {
        const invalidFormats = [
            // Missing @
            `${this.randomString(8)}${this.randomString(8)}.com`,
            // Multiple @
            `${this.randomString(5)}@${this.randomString(5)}@${this.randomString(5)}.com`,
            // Invalid domain
            `${this.randomString(8)}@${this.getRandomItem(this.invalidDomains)}`,
            // Missing domain
            `${this.randomString(8)}@`,
            // Missing local part
            `@${this.getRandomItem(this.validDomains)}`,
            // Invalid characters
            `${this.randomString(5)}#$%@${this.getRandomItem(this.validDomains)}`,
            // Spaces
            `${this.randomString(5)} ${this.randomString(5)}@${this.getRandomItem(this.validDomains)}`,
            // Double dots
            `${this.randomString(5)}..${this.randomString(5)}@${this.getRandomItem(this.validDomains)}`
        ];
        
        return this.getRandomItem(invalidFormats);
    }
    
    /**
     * Generate an email address with specific characteristics
     */
    generateEmailWithCharacteristics(characteristics = {}) {
        const {
            valid = true,
            domain = null,
            localLength = null,
            includeSpecialChars = false,
            includeNumbers = false,
            includeSubdomain = false
        } = characteristics;
        
        let localPart = '';
        let domainPart = domain || this.getRandomItem(valid ? this.validDomains : this.invalidDomains);
        
        // Generate local part
        if (localLength) {
            localPart = this.randomString(localLength);
        } else {
            localPart = this.getRandomItem(this.nameComponents.firstNames);
        }
        
        // Add special characters if requested
        if (includeSpecialChars) {
            const specialChar = this.getRandomItem(this.specialCharacters);
            localPart += specialChar + this.randomString(3);
        }
        
        // Add numbers if requested
        if (includeNumbers) {
            localPart += Math.floor(Math.random() * 999);
        }
        
        // Add subdomain if requested
        if (includeSubdomain) {
            domainPart = `${this.randomString(5)}.${domainPart}`;
        }
        
        return `${localPart}@${domainPart}`;
    }
    
    /**
     * Generate test emails with specific distribution
     */
    generateTestEmails(count = 10, options = {}) {
        const {
            validRatio = 0.8, // 80% valid emails by default
            includeEdgeCases = true,
            includeDuplicates = false,
            domains = null
        } = options;
        
        const emails = [];
        const validCount = Math.floor(count * validRatio);
        const invalidCount = count - validCount;
        
        // Generate valid emails
        for (let i = 0; i < validCount; i++) {
            if (domains) {
                const domain = this.getRandomItem(domains);
                emails.push(this.generateEmailWithCharacteristics({ valid: true, domain }));
            } else {
                emails.push(this.generateValidEmail());
            }
        }
        
        // Generate invalid emails
        for (let i = 0; i < invalidCount; i++) {
            emails.push(this.generateInvalidEmail());
        }
        
        // Add edge cases if requested
        if (includeEdgeCases) {
            const edgeCases = this.generateEdgeCaseEmails();
            emails.push(...edgeCases.slice(0, Math.min(edgeCases.length, Math.floor(count * 0.1))));
        }
        
        // Add duplicates if requested
        if (includeDuplicates && emails.length > 0) {
            const duplicateCount = Math.floor(count * 0.05); // 5% duplicates
            for (let i = 0; i < duplicateCount; i++) {
                emails.push(this.getRandomItem(emails));
            }
        }
        
        // Shuffle the array
        return this.shuffleArray(emails);
    }
    
    /**
     * Generate edge case email addresses for thorough testing
     */
    generateEdgeCaseEmails() {
        return [
            // Very long local part
            `${this.randomString(64)}@${this.getRandomItem(this.validDomains)}`,
            // Very long domain
            `test@${'very'.repeat(15)}.${this.getRandomItem(this.tlds)}`,
            // International characters (if supported)
            'test.ñoñó@example.com',
            'üser@example.com',
            // Plus addressing
            'user+tag@example.com',
            'user+long.tag.name@example.com',
            // Quoted local part
            '"test user"@example.com',
            // IP address domain
            'user@[192.168.1.1]',
            // Single character local part
            'a@example.com',
            // All numbers
            '12345@example.com',
            // All special characters (valid ones)
            'user._-+@example.com',
            // Case variations
            'User.Name@Example.Com',
            'USER@EXAMPLE.COM'
        ];
    }
    
    /**
     * Generate catch-all test emails
     */
    generateCatchAllEmails(count = 10) {
        const catchAllDomains = [
            'catchall-test.com',
            'catch.all.domain.com',
            'wildcard.example.org',
            'accept-all.test.net'
        ];
        
        const emails = [];
        
        for (let i = 0; i < count; i++) {
            const randomLocal = this.randomString(8);
            const domain = this.getRandomItem(catchAllDomains);
            emails.push(`${randomLocal}@${domain}`);
        }
        
        return emails;
    }
    
    /**
     * Generate bulk email data for performance testing
     */
    generateBulkEmailData(count = 1000, options = {}) {
        const {
            batchSize = 100,
            includeMetadata = false,
            generateUniqueIds = false
        } = options;
        
        const batches = [];
        let currentBatch = [];
        
        for (let i = 0; i < count; i++) {
            const email = this.generateValidEmail();
            const emailData = { email };
            
            if (generateUniqueIds) {
                emailData.global_id = this.generateUniqueId();
            }
            
            if (includeMetadata) {
                emailData.metadata = {
                    name: this.generateRandomName(),
                    source: 'test_generation',
                    created_at: new Date().toISOString(),
                    batch_number: Math.floor(i / batchSize) + 1
                };
            }
            
            currentBatch.push(emailData);
            
            if (currentBatch.length === batchSize) {
                batches.push([...currentBatch]);
                currentBatch = [];
            }
        }
        
        // Add remaining emails
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }
        
        return {
            batches,
            totalCount: count,
            batchCount: batches.length,
            averageBatchSize: count / batches.length
        };
    }
    
    /**
     * Generate test user data
     */
    generateTestUser() {
        const firstName = this.getRandomItem(this.nameComponents.firstNames);
        const lastName = this.getRandomItem(this.nameComponents.lastNames);
        
        return {
            name: `${firstName} ${lastName}`,
            email: `${firstName}.${lastName}@test.example.com`,
            password_hash: crypto.createHash('sha256').update(`password_${Date.now()}`).digest('hex'),
            status: 'active',
            created_ts: new Date()
        };
    }
    
    /**
     * Generate mock Bouncer API responses
     */
    generateMockBouncerResponse(emails, options = {}) {
        const {
            successRate = 0.9,
            includeDetailedInfo = true
        } = options;
        
        return emails.map(email => {
            const isSuccess = Math.random() < successRate;
            const emailStatus = this.determineMockEmailStatus(email);
            
            const response = {
                email,
                status: isSuccess ? emailStatus.status : 'unknown',
                reason: isSuccess ? emailStatus.reason : 'processing_error',
                score: isSuccess ? emailStatus.score : 0
            };
            
            if (includeDetailedInfo) {
                response.provider = this.extractProvider(email);
                response.toxic = Math.random() < 0.05; // 5% chance of toxic
                response.toxicity = response.toxic ? 'high' : 'low';
                
                if (isSuccess) {
                    response.domain_info = this.generateMockDomainInfo(email);
                    response.account_info = this.generateMockAccountInfo(email);
                    response.dns_info = this.generateMockDnsInfo(email);
                }
            }
            
            return response;
        });
    }
    
    /**
     * Determine mock email status based on email characteristics
     */
    determineMockEmailStatus(email) {
        // Simple heuristics for mock responses
        if (!email.includes('@') || email.includes('invalid') || email.includes('fake')) {
            return {
                status: 'undeliverable',
                reason: 'invalid_format',
                score: Math.floor(Math.random() * 20)
            };
        }
        
        if (email.includes('bounced') || email.includes('bad')) {
            return {
                status: 'undeliverable',
                reason: 'mailbox_not_found',
                score: Math.floor(Math.random() * 30)
            };
        }
        
        if (email.includes('catch') || email.includes('catchall')) {
            return {
                status: 'unknown',
                reason: 'catch_all',
                score: Math.floor(Math.random() * 50) + 25
            };
        }
        
        // Default to deliverable
        return {
            status: 'deliverable',
            reason: 'accepted',
            score: Math.floor(Math.random() * 30) + 70
        };
    }
    
    /**
     * Generate mock domain information
     */
    generateMockDomainInfo(email) {
        const domain = email.split('@')[1];
        return {
            domain,
            mx_records: [`mail.${domain}`, `mail2.${domain}`],
            has_mx: true,
            is_disposable: Math.random() < 0.1,
            is_role_account: Math.random() < 0.15
        };
    }
    
    /**
     * Generate mock account information
     */
    generateMockAccountInfo(email) {
        return {
            is_disabled: Math.random() < 0.05,
            is_full: Math.random() < 0.02,
            accepts_mail: Math.random() < 0.95,
            has_auto_reply: Math.random() < 0.1
        };
    }
    
    /**
     * Generate mock DNS information
     */
    generateMockDnsInfo(email) {
        const domain = email.split('@')[1];
        return {
            spf_record: Math.random() < 0.8,
            dmarc_record: Math.random() < 0.6,
            dkim_record: Math.random() < 0.7,
            mx_record_count: Math.floor(Math.random() * 5) + 1
        };
    }
    
    /**
     * Extract provider from email
     */
    extractProvider(email) {
        const domain = email.split('@')[1];
        
        if (domain.includes('gmail')) return 'gmail';
        if (domain.includes('yahoo')) return 'yahoo';
        if (domain.includes('hotmail') || domain.includes('outlook')) return 'microsoft';
        
        return 'other';
    }
    
    // Utility methods
    getRandomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    generateUniqueId() {
        return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }
    
    generateRandomName() {
        const firstName = this.getRandomItem(this.nameComponents.firstNames);
        const lastName = this.getRandomItem(this.nameComponents.lastNames);
        return `${firstName.charAt(0).toUpperCase()}${firstName.slice(1)} ${lastName.charAt(0).toUpperCase()}${lastName.slice(1)}`;
    }
    
    /**
     * Generate performance test scenarios
     */
    generatePerformanceTestScenarios() {
        return [
            {
                name: 'Small Batch',
                emailCount: 10,
                expectedProcessingTime: 5000, // 5 seconds
                description: 'Test basic functionality with small email set'
            },
            {
                name: 'Medium Batch',
                emailCount: 100,
                expectedProcessingTime: 30000, // 30 seconds
                description: 'Test typical usage scenario'
            },
            {
                name: 'Large Batch',
                emailCount: 1000,
                expectedProcessingTime: 180000, // 3 minutes
                description: 'Test high-volume processing'
            },
            {
                name: 'Extreme Batch',
                emailCount: 10000,
                expectedProcessingTime: 1800000, // 30 minutes
                description: 'Test maximum capacity'
            }
        ];
    }
    
    /**
     * Generate stress test data
     */
    generateStressTestData(concurrentUsers = 5, emailsPerUser = 100) {
        const testData = [];
        
        for (let userId = 1; userId <= concurrentUsers; userId++) {
            const userEmails = this.generateTestEmails(emailsPerUser, {
                validRatio: 0.9,
                includeEdgeCases: true
            });
            
            testData.push({
                userId: `stress_user_${userId}`,
                emails: userEmails,
                requestId: `stress_request_${userId}_${Date.now()}`,
                priority: Math.random() < 0.2 ? 'high' : 'normal' // 20% high priority
            });
        }
        
        return testData;
    }
    
    /**
     * Generate CSV test data
     */
    generateCsvTestData(count = 100) {
        const headers = ['email', 'name', 'company', 'source'];
        const rows = [];
        
        for (let i = 0; i < count; i++) {
            const email = this.generateValidEmail();
            const name = this.generateRandomName();
            const company = `Company ${i + 1}`;
            const source = this.getRandomItem(['website', 'import', 'api', 'manual']);
            
            rows.push([email, name, company, source]);
        }
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\\n');
        
        return {
            headers,
            rows,
            csvContent,
            count
        };
    }
}

module.exports = TestDataGenerator;