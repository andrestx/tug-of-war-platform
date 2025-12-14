const mongoose = require('mongoose');
const winston = require('winston');

// Create logger for database operations
const dbLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [DB] ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/database.log' })
    ]
});

class DatabaseManager {
    constructor() {
        this.isConnected = false;
        this.connectionRetries = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 seconds
    }

    /**
     * Connect to MongoDB database
     * @param {string} uri - MongoDB connection URI
     * @param {Object} options - Connection options
     */
    async connect(uri, options = {}) {
        try {
            // Default connection options
            const defaultOptions = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 30000, // 30 seconds
                socketTimeoutMS: 45000, // 45 seconds
                maxPoolSize: 100,
                minPoolSize: 10,
                maxIdleTimeMS: 30000,
                heartbeatFrequencyMS: 10000,
                ...options
            };

            // Set mongoose configuration
            mongoose.set('strictQuery', true);
            
            // Connect to database
            dbLogger.info(`Connecting to MongoDB at ${this.maskUri(uri)}...`);
            
            const connection = await mongoose.connect(uri, defaultOptions);
            
            this.isConnected = true;
            this.connectionRetries = 0;
            
            dbLogger.info('Successfully connected to MongoDB');
            
            // Set up event listeners
            this.setupEventListeners(connection);
            
            return connection;
        } catch (error) {
            dbLogger.error(`Failed to connect to MongoDB: ${error.message}`);
            
            // Retry connection
            if (this.connectionRetries < this.maxRetries) {
                this.connectionRetries++;
                dbLogger.info(`Retrying connection in ${this.retryDelay/1000} seconds (attempt ${this.connectionRetries}/${this.maxRetries})...`);
                
                await this.delay(this.retryDelay);
                return this.connect(uri, options);
            } else {
                dbLogger.error('Maximum connection retries reached. Exiting...');
                process.exit(1);
            }
        }
    }

    /**
     * Setup MongoDB event listeners
     * @param {mongoose.Connection} connection - MongoDB connection
     */
    setupEventListeners(connection) {
        const db = connection.connection;

        // Connection events
        db.on('connected', () => {
            dbLogger.info('MongoDB connected');
            this.isConnected = true;
        });

        db.on('disconnected', () => {
            dbLogger.warn('MongoDB disconnected');
            this.isConnected = false;
            
            // Attempt to reconnect
            setTimeout(() => {
                dbLogger.info('Attempting to reconnect to MongoDB...');
                mongoose.connect(process.env.MONGODB_URI, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true
                });
            }, 5000);
        });

        db.on('reconnected', () => {
            dbLogger.info('MongoDB reconnected');
            this.isConnected = true;
        });

        db.on('error', (error) => {
            dbLogger.error(`MongoDB connection error: ${error.message}`);
        });

        // Mongoose events
        mongoose.connection.on('connecting', () => {
            dbLogger.info('Connecting to MongoDB...');
        });

        mongoose.connection.on('open', () => {
            dbLogger.info('MongoDB connection is open');
        });

        mongoose.connection.on('close', () => {
            dbLogger.warn('MongoDB connection closed');
        });

        // Set up connection health check
        this.setupHealthCheck();
    }

    /**
     * Setup periodic health check
     */
    setupHealthCheck() {
        // Check connection status every 30 seconds
        setInterval(() => {
            if (!this.isConnected) {
                dbLogger.warn('Database connection health check failed');
                
                // Attempt to ping database
                mongoose.connection.db.admin().ping((err, result) => {
                    if (err || !result) {
                        dbLogger.error('Database ping failed');
                    } else {
                        dbLogger.info('Database ping successful');
                        this.isConnected = true;
                    }
                });
            }
        }, 30000);
    }

    /**
     * Get database connection status
     * @returns {boolean} - Connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
            models: Object.keys(mongoose.models),
            collections: Object.keys(mongoose.connection.collections)
        };
    }

    /**
     * Get database statistics
     * @returns {Promise<Object>} - Database statistics
     */
    async getStats() {
        try {
            if (!this.isConnected) {
                throw new Error('Database not connected');
            }

            const db = mongoose.connection.db;
            const adminDb = db.admin();
            
            // Get server status
            const serverStatus = await adminDb.serverStatus();
            
            // Get database stats
            const dbStats = await db.stats();
            
            // Get collection stats
            const collections = await db.collections();
            const collectionStats = [];
            
            for (const collection of collections) {
                try {
                    const stats = await collection.stats();
                    collectionStats.push({
                        name: collection.collectionName,
                        count: stats.count,
                        size: stats.size,
                        storageSize: stats.storageSize,
                        avgObjSize: stats.avgObjSize
                    });
                } catch (err) {
                    dbLogger.warn(`Could not get stats for collection ${collection.collectionName}: ${err.message}`);
                }
            }

            return {
                server: {
                    version: serverStatus.version,
                    uptime: serverStatus.uptime,
                    connections: serverStatus.connections,
                    memory: serverStatus.mem
                },
                database: {
                    name: dbStats.db,
                    collections: dbStats.collections,
                    objects: dbStats.objects,
                    avgObjSize: dbStats.avgObjSize,
                    dataSize: dbStats.dataSize,
                    storageSize: dbStats.storageSize,
                    indexSize: dbStats.indexSize
                },
                collections: collectionStats
            };
        } catch (error) {
            dbLogger.error(`Failed to get database stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Perform database maintenance
     * @returns {Promise<Object>} - Maintenance results
     */
    async performMaintenance() {
        try {
            dbLogger.info('Starting database maintenance...');
            
            const results = {
                reindexed: [],
                compacted: [],
                repaired: []
            };

            const db = mongoose.connection.db;
            const collections = await db.collections();
            
            // Reindex collections
            for (const collection of collections) {
                try {
                    await collection.reIndex();
                    results.reindexed.push(collection.collectionName);
                    dbLogger.info(`Reindexed collection: ${collection.collectionName}`);
                } catch (error) {
                    dbLogger.warn(`Failed to reindex ${collection.collectionName}: ${error.message}`);
                }
            }

            // Compact collections (if supported)
            for (const collection of collections) {
                try {
                    await db.command({ compact: collection.collectionName });
                    results.compacted.push(collection.collectionName);
                    dbLogger.info(`Compacted collection: ${collection.collectionName}`);
                } catch (error) {
                    dbLogger.warn(`Failed to compact ${collection.collectionName}: ${error.message}`);
                }
            }

            dbLogger.info('Database maintenance completed');
            return results;
        } catch (error) {
            dbLogger.error(`Database maintenance failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create database indexes for optimal performance
     * @returns {Promise<Object>} - Index creation results
     */
    async createIndexes() {
        try {
            dbLogger.info('Creating database indexes...');
            
            const models = mongoose.models;
            const results = {
                created: [],
                errors: []
            };

            // Create indexes for each model
            for (const [modelName, model] of Object.entries(models)) {
                try {
                    await model.createIndexes();
                    results.created.push(modelName);
                    dbLogger.info(`Created indexes for model: ${modelName}`);
                } catch (error) {
                    results.errors.push({
                        model: modelName,
                        error: error.message
                    });
                    dbLogger.error(`Failed to create indexes for ${modelName}: ${error.message}`);
                }
            }

            dbLogger.info('Database indexes created');
            return results;
        } catch (error) {
            dbLogger.error(`Failed to create indexes: ${error.message}`);
            throw error;
        }
    }

    /**
     * Backup database
     * @param {string} backupPath - Path to store backup
     * @returns {Promise<string>} - Backup file path
     */
    async backupDatabase(backupPath = './backups') {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);

            // Create backup directory if it doesn't exist
            await fs.mkdir(backupPath, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `tug-of-war-backup-${timestamp}`;
            const fullBackupPath = path.join(backupPath, backupName);

            // Get MongoDB connection details from URI
            const uri = process.env.MONGODB_URI;
            const match = uri.match(/mongodb:\/\/(?:([^:]+):([^@]+)@)?([^/]+)\/([^?]+)/);
            
            if (!match) {
                throw new Error('Invalid MongoDB URI');
            }

            const [, username, password, host, database] = match;
            const authString = username && password ? `-u ${username} -p ${password}` : '';
            
            // Create backup command
            const backupCommand = `mongodump ${authString} --host ${host} --db ${database} --out ${fullBackupPath}`;
            
            dbLogger.info(`Creating database backup: ${backupName}`);
            dbLogger.debug(`Backup command: ${backupCommand.replace(password, '*****')}`);

            // Execute backup
            const { stdout, stderr } = await execPromise(backupCommand);
            
            if (stderr && !stderr.includes('writing')) {
                throw new Error(`Backup failed: ${stderr}`);
            }

            // Compress backup
            const tarCommand = `tar -czf ${fullBackupPath}.tar.gz -C ${backupPath} ${backupName}`;
            await execPromise(tarCommand);

            // Remove uncompressed backup
            await fs.rm(fullBackupPath, { recursive: true });

            const backupFile = `${fullBackupPath}.tar.gz`;
            dbLogger.info(`Backup created successfully: ${backupFile}`);
            
            return backupFile;
        } catch (error) {
            dbLogger.error(`Database backup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Restore database from backup
     * @param {string} backupFile - Path to backup file
     * @returns {Promise<boolean>} - Restore success
     */
    async restoreDatabase(backupFile) {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);

            // Check if backup file exists
            await fs.access(backupFile);

            const backupPath = path.dirname(backupFile);
            const backupName = path.basename(backupFile, '.tar.gz');
            const extractPath = path.join(backupPath, backupName);

            // Extract backup
            dbLogger.info(`Extracting backup: ${backupFile}`);
            const tarCommand = `tar -xzf ${backupFile} -C ${backupPath}`;
            await execPromise(tarCommand);

            // Get MongoDB connection details
            const uri = process.env.MONGODB_URI;
            const match = uri.match(/mongodb:\/\/(?:([^:]+):([^@]+)@)?([^/]+)\/([^?]+)/);
            
            if (!match) {
                throw new Error('Invalid MongoDB URI');
            }

            const [, username, password, host, database] = match;
            const authString = username && password ? `-u ${username} -p ${password}` : '';
            
            // Restore database
            const restoreCommand = `mongorestore ${authString} --host ${host} --db ${database} --drop ${extractPath}/${database}`;
            
            dbLogger.info(`Restoring database from backup: ${backupName}`);
            dbLogger.debug(`Restore command: ${restoreCommand.replace(password, '*****')}`);

            const { stdout, stderr } = await execPromise(restoreCommand);
            
            if (stderr && !stderr.includes('restoring')) {
                throw new Error(`Restore failed: ${stderr}`);
            }

            // Clean up extracted files
            await fs.rm(extractPath, { recursive: true });

            dbLogger.info('Database restored successfully');
            return true;
        } catch (error) {
            dbLogger.error(`Database restore failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Close database connection
     * @returns {Promise<void>}
     */
    async close() {
        try {
            dbLogger.info('Closing database connection...');
            await mongoose.connection.close();
            this.isConnected = false;
            dbLogger.info('Database connection closed');
        } catch (error) {
            dbLogger.error(`Failed to close database connection: ${error.message}`);
            throw error;
        }
    }

    /**
     * Drop database (USE WITH CAUTION!)
     * @returns {Promise<boolean>}
     */
    async dropDatabase() {
        try {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Cannot drop database in production environment');
            }

            dbLogger.warn('DROPPING DATABASE - THIS ACTION CANNOT BE UNDONE!');
            
            // Double confirmation
            const confirmation = await this.promptConfirmation(
                'Are you absolutely sure you want to drop the entire database? (yes/NO): '
            );

            if (confirmation !== 'yes') {
                dbLogger.info('Database drop cancelled');
                return false;
            }

            await mongoose.connection.db.dropDatabase();
            dbLogger.info('Database dropped successfully');
            return true;
        } catch (error) {
            dbLogger.error(`Failed to drop database: ${error.message}`);
            throw error;
        }
    }

    /**
     * Utility: Mask sensitive information in URI
     * @param {string} uri - MongoDB URI
     * @returns {string} - Masked URI
     */
    maskUri(uri) {
        return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    }

    /**
     * Utility: Delay execution
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Utility: Prompt for confirmation
     * @param {string} message - Confirmation message
     * @returns {Promise<string>} - User input
     */
    async promptConfirmation(message) {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            readline.question(message, (answer) => {
                readline.close();
                resolve(answer.trim().toLowerCase());
            });
        });
    }

    /**
     * Create initial database setup (indexes, collections, etc.)
     * @returns {Promise<void>}
     */
    async initializeDatabase() {
        try {
            dbLogger.info('Initializing database...');
            
            // Create indexes
            await this.createIndexes();
            
            // Create necessary collections if they don't exist
            const db = mongoose.connection.db;
            
            // Create capped collections for real-time data if needed
            const cappedCollections = [
                {
                    name: 'game_events',
                    options: {
                        capped: true,
                        size: 10485760, // 10MB
                        max: 10000
                    }
                },
                {
                    name: 'user_activities',
                    options: {
                        capped: true,
                        size: 5242880, // 5MB
                        max: 5000
                    }
                }
            ];

            for (const collection of cappedCollections) {
                try {
                    const exists = await db.listCollections({ name: collection.name }).hasNext();
                    if (!exists) {
                        await db.createCollection(collection.name, collection.options);
                        dbLogger.info(`Created capped collection: ${collection.name}`);
                    }
                } catch (error) {
                    dbLogger.warn(`Could not create collection ${collection.name}: ${error.message}`);
                }
            }

            // Create database views for analytics
            await this.createDatabaseViews();
            
            dbLogger.info('Database initialization completed');
        } catch (error) {
            dbLogger.error(`Database initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create database views for analytics
     * @returns {Promise<void>}
     */
    async createDatabaseViews() {
        try {
            const db = mongoose.connection.db;

            // View: User game statistics
            const userStatsView = {
                viewOn: 'sessions',
                pipeline: [
                    {
                        $unwind: '$participants'
                    },
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'participants.user',
                            foreignField: '_id',
                            as: 'userInfo'
                        }
                    },
                    {
                        $unwind: '$userInfo'
                    },
                    {
                        $group: {
                            _id: '$userInfo._id',
                            name: { $first: '$userInfo.name' },
                            email: { $first: '$userInfo.email' },
                            role: { $first: '$userInfo.role' },
                            totalGames: { $sum: 1 },
                            totalScore: { $sum: '$participants.score' },
                            correctAnswers: { $sum: '$participants.correctAnswers' },
                            wins: {
                                $sum: {
                                    $cond: [
                                        {
                                            $or: [
                                                {
                                                    $and: [
                                                        { $eq: ['$scores.red', { $max: ['$scores.red', '$scores.blue'] }] },
                                                        { $eq: ['$participants.team', 'red'] }
                                                    ]
                                                },
                                                {
                                                    $and: [
                                                        { $eq: ['$scores.blue', { $max: ['$scores.red', '$scores.blue'] }] },
                                                        { $eq: ['$participants.team', 'blue'] }
                                                    ]
                                                }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },
                            lastPlayed: { $max: '$endTime' }
                        }
                    },
                    {
                        $project: {
                            name: 1,
                            email: 1,
                            role: 1,
                            totalGames: 1,
                            totalScore: 1,
                            averageScore: { $divide: ['$totalScore', '$totalGames'] },
                            correctAnswers: 1,
                            winRate: { $multiply: [{ $divide: ['$wins', '$totalGames'] }, 100] },
                            lastPlayed: 1
                        }
                    }
                ]
            };

            // Check if view exists
            const views = await db.listCollections({ name: 'user_statistics' }).toArray();
            if (views.length === 0) {
                await db.createCollection('user_statistics', userStatsView);
                dbLogger.info('Created user_statistics view');
            }

            // View: Session statistics by subject
            const sessionStatsView = {
                viewOn: 'sessions',
                pipeline: [
                    {
                        $match: {
                            status: 'ended'
                        }
                    },
                    {
                        $group: {
                            _id: '$subject',
                            totalSessions: { $sum: 1 },
                            totalParticipants: { $sum: { $size: '$participants' } },
                            totalQuestions: { $sum: { $size: '$questions' } },
                            avgDuration: {
                                $avg: {
                                    $divide: [
                                        { $subtract: ['$endTime', '$startTime'] },
                                        60000 // Convert to minutes
                                    ]
                                }
                            },
                            avgScore: {
                                $avg: {
                                    $add: ['$scores.red', '$scores.blue']
                                }
                            },
                            mostRecent: { $max: '$endTime' }
                        }
                    },
                    {
                        $project: {
                            subject: '$_id',
                            totalSessions: 1,
                            totalParticipants: 1,
                            totalQuestions: 1,
                            avgDuration: { $round: ['$avgDuration', 2] },
                            avgScore: { $round: ['$avgScore', 2] },
                            mostRecent: 1,
                            participantsPerSession: {
                                $round: [{ $divide: ['$totalParticipants', '$totalSessions'] }, 2]
                            }
                        }
                    }
                ]
            };

            const sessionViews = await db.listCollections({ name: 'session_statistics' }).toArray();
            if (sessionViews.length === 0) {
                await db.createCollection('session_statistics', sessionStatsView);
                dbLogger.info('Created session_statistics view');
            }
        } catch (error) {
            dbLogger.warn(`Could not create database views: ${error.message}`);
        }
    }

    /**
     * Create database indexes for performance optimization
     * @returns {Promise<void>}
     */
    async createPerformanceIndexes() {
        try {
            const db = mongoose.connection.db;

            // Indexes for sessions collection
            await db.collection('sessions').createIndexes([
                {
                    key: { code: 1 },
                    unique: true,
                    name: 'code_unique'
                },
                {
                    key: { teacher: 1, createdAt: -1 },
                    name: 'teacher_sessions'
                },
                {
                    key: { status: 1, createdAt: -1 },
                    name: 'active_sessions'
                },
                {
                    key: { 'participants.user': 1 },
                    name: 'user_participation'
                },
                {
                    key: { subject: 1, grade: 1 },
                    name: 'subject_grade_search'
                },
                {
                    key: { createdAt: -1 },
                    name: 'recent_sessions'
                }
            ]);

            // Indexes for users collection
            await db.collection('users').createIndexes([
                {
                    key: { email: 1 },
                    unique: true,
                    name: 'email_unique'
                },
                {
                    key: { googleId: 1 },
                    unique: true,
                    sparse: true,
                    name: 'google_id_unique'
                },
                {
                    key: { role: 1, createdAt: -1 },
                    name: 'users_by_role'
                },
                {
                    key: { 'stats.totalGames': -1 },
                    name: 'top_players'
                }
            ]);

            // Indexes for questions collection
            await db.collection('questions').createIndexes([
                {
                    key: { session: 1, order: 1 },
                    name: 'session_questions'
                },
                {
                    key: { difficulty: 1 },
                    name: 'question_difficulty'
                }
            ]);

            // Compound indexes for complex queries
            await db.collection('sessions').createIndex({
                status: 1,
                'participants.user': 1,
                startTime: -1
            }, {
                name: 'user_active_sessions'
            });

            await db.collection('sessions').createIndex({
                teacher: 1,
                status: 1,
                createdAt: -1
            }, {
                name: 'teacher_session_status'
            });

            dbLogger.info('Performance indexes created successfully');
        } catch (error) {
            dbLogger.error(`Failed to create performance indexes: ${error.message}`);
            throw error;
        }
    }

    /**
     * Monitor database performance
     * @returns {Promise<Object>} - Performance metrics
     */
    async monitorPerformance() {
        try {
            const db = mongoose.connection.db;
            const adminDb = db.admin();

            // Get current operation statistics
            const currentOps = await adminDb.currentOp();

            // Get database profiling level
            const profiling = await db.profilingInfo().toArray();

            // Get index usage statistics
            const indexStats = await db.collection('system.indexes').find({}).toArray();

            return {
                timestamp: new Date(),
                currentOperations: currentOps.inprog.length,
                profilingLevel: profiling[0]?.was || 'off',
                indexes: indexStats.length,
                connections: mongoose.connections.length,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            };
        } catch (error) {
            dbLogger.error(`Performance monitoring failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Validate database integrity
     * @returns {Promise<Object>} - Validation results
     */
    async validateDatabase() {
        try {
            const db = mongoose.connection.db;
            const collections = await db.collections();
            const results = {
                valid: true,
                errors: [],
                warnings: []
            };

            for (const collection of collections) {
                try {
                    // Validate collection using validate command
                    const validation = await collection.validate();
                    
                    if (!validation.valid) {
                        results.valid = false;
                        results.errors.push({
                            collection: collection.collectionName,
                            issues: validation.errors
                        });
                    }
                } catch (error) {
                    results.warnings.push({
                        collection: collection.collectionName,
                        message: `Validation failed: ${error.message}`
                    });
                }
            }

            // Check referential integrity
            await this.checkReferentialIntegrity(results);

            return results;
        } catch (error) {
            dbLogger.error(`Database validation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check referential integrity
     * @param {Object} results - Validation results object
     */
    async checkReferentialIntegrity(results) {
        try {
            const db = mongoose.connection.db;

            // Check sessions -> users (teacher)
            const invalidSessions = await db.collection('sessions').aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: 'teacher',
                        foreignField: '_id',
                        as: 'teacherInfo'
                    }
                },
                {
                    $match: {
                        teacherInfo: { $size: 0 }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        code: 1,
                        teacher: 1
                    }
                }
            ]).toArray();

            if (invalidSessions.length > 0) {
                results.warnings.push({
                    type: 'referential_integrity',
                    message: 'Found sessions with invalid teacher references',
                    details: invalidSessions
                });
            }

            // Check questions -> sessions
            const invalidQuestions = await db.collection('questions').aggregate([
                {
                    $lookup: {
                        from: 'sessions',
                        localField: 'session',
                        foreignField: '_id',
                        as: 'sessionInfo'
                    }
                },
                {
                    $match: {
                        sessionInfo: { $size: 0 }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        session: 1
                    }
                }
            ]).toArray();

            if (invalidQuestions.length > 0) {
                results.warnings.push({
                    type: 'referential_integrity',
                    message: 'Found questions with invalid session references',
                    details: invalidQuestions
                });
            }
        } catch (error) {
            dbLogger.warn(`Referential integrity check failed: ${error.message}`);
        }
    }

    /**
     * Clean up orphaned data
     * @returns {Promise<Object>} - Cleanup results
     */
    async cleanupOrphanedData() {
        try {
            const db = mongoose.connection.db;
            const results = {
                removed: 0,
                details: {}
            };

            // Clean up orphaned session participants (users that no longer exist)
            const orphanedParticipants = await db.collection('sessions').aggregate([
                {
                    $unwind: '$participants'
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'participants.user',
                        foreignField: '_id',
                        as: 'userInfo'
                    }
                },
                {
                    $match: {
                        userInfo: { $size: 0 }
                    }
                },
                {
                    $group: {
                        _id: '$_id',
                        code: { $first: '$code' },
                        orphanedUsers: { $push: '$participants.user' }
                    }
                }
            ]).toArray();

            for (const session of orphanedParticipants) {
                const updateResult = await db.collection('sessions').updateOne(
                    { _id: session._id },
                    {
                        $pull: {
                            participants: {
                                user: { $in: session.orphanedUsers }
                            }
                        }
                    }
                );

                if (updateResult.modifiedCount > 0) {
                    results.removed += updateResult.modifiedCount;
                    results.details[session.code] = {
                        removedParticipants: session.orphanedUsers.length
                    };
                }
            }

            // Clean up questions for non-existent sessions
            const orphanedQuestions = await db.collection('questions').aggregate([
                {
                    $lookup: {
                        from: 'sessions',
                        localField: 'session',
                        foreignField: '_id',
                        as: 'sessionInfo'
                    }
                },
                {
                    $match: {
                        sessionInfo: { $size: 0 }
                    }
                }
            ]).toArray();

            if (orphanedQuestions.length > 0) {
                const deleteResult = await db.collection('questions').deleteMany({
                    _id: { $in: orphanedQuestions.map(q => q._id) }
                });

                results.removed += deleteResult.deletedCount;
                results.details.orphanedQuestions = deleteResult.deletedCount;
            }

            dbLogger.info(`Cleanup completed: removed ${results.removed} orphaned records`);
            return results;
        } catch (error) {
            dbLogger.error(`Cleanup failed: ${error.message}`);
            throw error;
        }
    }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Export the manager and mongoose for convenience
module.exports = {
    databaseManager,
    mongoose,
    
    // Helper functions
    connectDatabase: async (uri, options) => {
        return databaseManager.connect(uri, options);
    },
    
    disconnectDatabase: async () => {
        return databaseManager.close();
    },
    
    getDatabaseStatus: () => {
        return databaseManager.getStatus();
    },
    
    getDatabaseStats: async () => {
        return databaseManager.getStats();
    },
    
    performMaintenance: async () => {
        return databaseManager.performMaintenance();
    },
    
    createIndexes: async () => {
        return databaseManager.createIndexes();
    },
    
    backupDatabase: async (path) => {
        return databaseManager.backupDatabase(path);
    },
    
    restoreDatabase: async (backupFile) => {
        return databaseManager.restoreDatabase(backupFile);
    },
    
    dropDatabase: async () => {
        return databaseManager.dropDatabase();
    },
    
    initializeDatabase: async () => {
        return databaseManager.initializeDatabase();
    },
    
    monitorPerformance: async () => {
        return databaseManager.monitorPerformance();
    },
    
    validateDatabase: async () => {
        return databaseManager.validateDatabase();
    },
    
    cleanupOrphanedData: async () => {
        return databaseManager.cleanupOrphanedData();
    },
    
    // Constants for connection states
    CONNECTION_STATES: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
        99: 'uninitialized'
    }
};
