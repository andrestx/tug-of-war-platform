const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Session = require('../models/Session');
const Question = require('../models/Question');
const User = require('../models/User');

// Create a new session
router.post('/', [
  body('name').trim().notEmpty(),
  body('subject').isIn(['istorie', 'matematica', 'romana', 'geografie', 'biologie', 
                       'fizica', 'chimie', 'engleza', 'informatica', 'franceza',
                       'educatie_fizica', 'educatie_plastică', 'muzica', 'other']),
  body('grade').optional().isInt({ min: 1, max: 12 }),
  body('settings.timePerQuestion').optional().isInt({ min: 5, max: 60 }),
  body('questions').isArray({ min: 3 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { name, subject, grade, settings, questions } = req.body;
    const teacher = req.userId;

    // Create session
    const session = new Session({
      name,
      subject,
      grade,
      settings: settings || {},
      teacher,
      status: 'draft'
    });

    await session.save();

    // Create questions
    const questionPromises = questions.map((qData, index) => {
      const question = new Question({
        session: session._id,
        text: qData.text,
        answers: qData.answers,
        correctAnswer: qData.correctAnswer,
        explanation: qData.explanation,
        difficulty: qData.difficulty,
        points: qData.points || 1,
        order: index
      });
      return question.save();
    });

    const createdQuestions = await Promise.all(questionPromises);
    
    // Link questions to session
    session.questions = createdQuestions.map(q => q._id);
    await session.save();

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      session: {
        _id: session._id,
        code: session.code,
        name: session.name,
        subject: session.subject,
        status: session.status,
        questions: createdQuestions.length
      }
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating session'
    });
  }
});

// Get all sessions for teacher
router.get('/', async (req, res) => {
  try {
    const teacher = req.userId;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { teacher };
    if (status) {
      query.status = status;
    }

    const sessions = await Session.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('questions', 'text')
      .lean();

    const total = await Session.countDocuments(query);

    res.json({
      success: true,
      sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching sessions'
    });
  }
});

// Get session by code
router.get('/code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const session = await Session.findOne({ code })
      .populate('questions')
      .populate('teacher', 'name email avatar')
      .populate('participants.user', 'name avatar')
      .lean();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Remove sensitive data
    delete session.teacher.password;
    delete session.teacher.googleId;

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('Get session by code error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching session'
    });
  }
});

// Join a session
router.post('/:code/join', async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.userId;

    const session = await Session.findOne({ code, status: { $in: ['waiting', 'started'] } });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or not joinable'
      });
    }

    // Check if user is already joined
    const existingParticipant = session.participants.find(
      p => p.user.toString() === userId.toString()
    );

    if (existingParticipant) {
      if (!existingParticipant.isActive) {
        existingParticipant.isActive = true;
        await session.save();
      }

      return res.json({
        success: true,
        message: 'Rejoined session',
        session: session,
        team: existingParticipant.team
      });
    }

    // Check max players
    if (session.participants.length >= session.settings.maxPlayers) {
      return res.status(400).json({
        success: false,
        message: 'Session is full'
      });
    }

    // Assign team
    let team;
    const redCount = session.participants.filter(p => p.team === 'red').length;
    const blueCount = session.participants.filter(p => p.team === 'blue').length;
    
    if (session.settings.teamAssignment === 'auto') {
      team = redCount <= blueCount ? 'red' : 'blue';
    } else {
      team = Math.random() > 0.5 ? 'red' : 'blue';
    }

    // Add participant
    session.participants.push({
      user: userId,
      team,
      joinedAt: Date.now(),
      score: 0,
      correctAnswers: 0,
      isActive: true
    });

    await session.save();

    // Emit socket event for new participant
    req.io.to(session._id.toString()).emit('participant-joined', {
      userId,
      team,
      totalParticipants: session.participants.length
    });

    res.json({
      success: true,
      message: 'Joined session successfully',
      session: session,
      team
    });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error joining session'
    });
  }
});

// Start a session
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.userId;

    const session = await Session.findOne({ 
      _id: id, 
      teacher: teacherId,
      status: { $in: ['draft', 'waiting'] }
    }).populate('questions');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or not startable'
      });
    }

    if (session.questions.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Session must have at least 3 questions'
      });
    }

    // Update session status
    session.status = 'started';
    session.startTime = Date.now();
    
    // Set first question as current
    session.currentQuestion = session.questions[0]._id;
    
    await session.save();

    // Emit socket event for session start
    req.io.to(session._id.toString()).emit('session-started', {
      sessionId: session._id,
      startTime: session.startTime,
      totalQuestions: session.questions.length
    });

    // Send first question
    req.io.to(session._id.toString()).emit('question-update', {
      question: session.questions[0],
      questionNumber: 1,
      totalQuestions: session.questions.length
    });

    res.json({
      success: true,
      message: 'Session started successfully',
      session: {
        _id: session._id,
        code: session.code,
        name: session.name,
        status: session.status,
        startTime: session.startTime
      }
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error starting session'
    });
  }
});

// End a session
router.post('/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.userId;

    const session = await Session.findOne({ 
      _id: id, 
      teacher: teacherId,
      status: 'started'
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or not running'
      });
    }

    // Update session status
    session.status = 'ended';
    session.endTime = Date.now();
    await session.save();

    // Update user stats
    await updateUserStats(session);

    // Emit socket event for session end
    req.io.to(session._id.toString()).emit('session-ended', {
      sessionId: session._id,
      endTime: session.endTime,
      scores: session.scores,
      winner: session.scores.red > session.scores.blue ? 'red' : 
              session.scores.blue > session.scores.red ? 'blue' : 'draw'
    });

    res.json({
      success: true,
      message: 'Session ended successfully',
      session: {
        _id: session._id,
        code: session.code,
        name: session.name,
        status: session.status,
        endTime: session.endTime,
        scores: session.scores
      }
    });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error ending session'
    });
  }
});

// Get session leaderboard
router.get('/:id/leaderboard', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await Session.findById(id)
      .populate('participants.user', 'name avatar')
      .lean();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Prepare leaderboard data
    const leaderboard = session.participants
      .filter(p => p.isActive)
      .map(p => ({
        userId: p.user._id,
        name: p.user.name,
        avatar: p.user.avatar,
        team: p.team,
        score: p.score,
        correctAnswers: p.correctAnswers,
        totalAnswers: session.gameHistory.length
      }))
      .sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching leaderboard'
    });
  }
});

// Helper function to update user stats
async function updateUserStats(session) {
  try {
    for (const participant of session.participants) {
      const user = await User.findById(participant.user);
      if (user) {
        user.stats.totalGames += 1;
        user.stats.totalQuestions += session.questions.length;
        user.stats.correctAnswers += participant.correctAnswers;
        user.stats.averageScore = 
          (user.stats.averageScore * (user.stats.totalGames - 1) + participant.score) / user.stats.totalGames;
        
        if (participant.team === (session.scores.red > session.scores.blue ? 'red' : 'blue')) {
          user.stats.wins += 1;
        }
        
        await user.save();
      }
    }
  } catch (error) {
    console.error('Update user stats error:', error);
  }
}

module.exports = router;
