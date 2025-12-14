// Script de inițializare MongoDB
db = db.getSiblingDB('tugofwar');

// Creează utilizator pentru aplicație
db.createUser({
    user: 'tugofwar_user',
    pwd: '${MONGO_APP_PASSWORD}',
    roles: [
        {
            role: 'readWrite',
            db: 'tugofwar'
        }
    ]
});

// Creează colecții inițiale
db.createCollection('users');
db.createCollection('sessions');
db.createCollection('questions');
db.createCollection('game_events');
db.createCollection('user_activities');

// Creare indecși
db.users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
db.users.createIndex({ googleId: 1 }, { unique: true, sparse: true, name: 'google_id_unique' });
db.users.createIndex({ role: 1 }, { name: 'role_index' });

db.sessions.createIndex({ code: 1 }, { unique: true, name: 'code_unique' });
db.sessions.createIndex({ teacher: 1 }, { name: 'teacher_index' });
db.sessions.createIndex({ status: 1 }, { name: 'status_index' });
db.sessions.createIndex({ 'participants.user': 1 }, { name: 'participants_index' });

db.questions.createIndex({ session: 1 }, { name: 'session_questions_index' });

print('MongoDB initialization completed successfully!');
