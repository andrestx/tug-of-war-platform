const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const Question = require('../models/Question');

// Submit answer for current question
router.post('/:sessionId/answer', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { questionId, answerIndex } = req.body;
    const userId = req.userId;

    const session = await Session.findOne({
      _id: sessionId,
      status: 'started',
      'participants.user': userId,
      'participants.isActive': true
    }).populate('currentQuestion');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or not active'
      });
    }

    // Check if question is current
    if (session.currentQuestion._id.toString() !== questionId) {
      return res.status(400).json({
        success: false,
        message: 'This question is not current'
      });
    }

    // Find participant
    const participant = session.participants.find(
      p => p.user.toString() === userId.toString()
    );

    if (!participant) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this session'
      });
    }

    // Check if already answered
    const currentQuestionHistory = session.gameHistory.find(
      h => h.question.toString() === questionId
    );

    if (currentQuestionHistory) {
      const teamHistory = participant.team === 'red' 
        ? currentQuestionHistory.redAnswers 
        : currentQuestionHistory.blueAnswers;

      if (teamHistory.total > 0) {
        return res.status(400).json({
          success: false,
          message: 'Already answered this question'
        });
      }
    }

    // Check answer
    const isCorrect = answerIndex === session.currentQuestion.correctAnswer;
    const points = isCorrect ? session.currentQuestion.points : 0;

    // Update participant score
    participant.score += points;
    if (isCorrect) {
      participant.correctAnswers += 1;
    }

    // Update team score
    if (participant.team === 'red') {
      session.scores.red += points;
    } else {
      session.scores.blue += points;
    }

    // Update game history
    let questionHistory = session.gameHistory.find(
      h => h.question.toString() === questionId
    );

    if (!questionHistory) {
      questionHistory = {
        question: questionId,
        timestamp: Date.now(),
        redAnswers: { correct: 0, total: 0 },
        blueAnswers: { correct: 0, total: 0 }
      };
      session.gameHistory.push(questionHistory);
    }

    // Update answer statistics
    if (participant.team === 'red') {
      questionHistory.redAnswers.total += 1;
      if (isCorrect) questionHistory.redAnswers.correct += 1;
    } else {
      questionHistory.blueAnswers.total += 1;
      if (isCorrect) questionHistory.blueAnswers.correct += 1;
    }

    await session.save();

    // Emit score update
    req.io.to(sessionId).emit('score-update', {
      scores: session.scores,
      teamScores: {
        red: {
          score: session.scores.red,
          participants: session.participants.filter(p => p.team === 'red').length
        },
        blue: {
          score: session.scores.blue,
          participants: session.participants.filter(p => p.team === 'blue').length
        }
      }
    });

    // Emit individual answer result
    req.io.to(sessionId).emit('answer-result', {
      userId,
      questionId,
      isCorrect,
      points,
      team: participant.team
    });

    res.json({
      success: true,
      isCorrect,
      points,
      teamScore: participant.team === 'red' ? session.scores.red : session.scores.blue,
      participantScore: participant.score
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting answer'
    });
  }
});

// Get current game state
router.get('/:sessionId/state', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId;

    const session = await Session.findById(sessionId)
      .populate('currentQuestion')
      .populate('participants.user', 'name avatar')
      .lean();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Find participant
    const participant = session.participants.find(
      p => p.user._id.toString() === userId.toString()
    );

    // Prepare response
    const gameState = {
      session: {
        _id: session._id,
        code: session.code,
        name: session.name,
        status: session.status,
        currentQuestion: session.currentQuestion,
        scores: session.scores,
        startTime: session.startTime,
        settings: session.settings
      },
      participant: participant ? {
        team: participant.team,
        score: participant.score,
        correctAnswers: participant.correctAnswers
      } : null,
      teams: {
        red: {
          score: session.scores.red,
          participants: session.participants.filter(p => p.team === 'red').map(p => ({
            name: p.user.name,
            avatar: p.user.avatar,
            score: p.score
          }))
        },
        blue: {
          score: session.scores.blue,
          participants: session.participants.filter(p => p.team === 'blue').map(p => ({
            name: p.user.name,
            avatar: p.user.avatar,
            score: p.score
          }))
        }
      }
    };

    res.json({
      success: true,
      gameState
    });
  } catch (error) {
    console.error('Get game state error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching game state'
    });
  }
});

// Get question details
router.get('/:sessionId/question/:questionId', async (req, res) => {
  try {
    const { sessionId, questionId } = req.params;

    const question = await Question.findOne({
      _id: questionId,
      session: sessionId
    }).lean();

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    res.json({
      success: true,
      question: {
        _id: question._id,
        text: question.text,
        answers: question.answers,
        points: question.points,
        difficulty: question.difficulty,
        order: question.order
      }
    });
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching question'
    });
  }
});

// Next question (teacher only)
router.post('/:sessionId/next-question', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.userId;

    const session = await Session.findOne({
      _id: sessionId,
      teacher: teacherId,
      status: 'started'
    }).populate('questions');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or not authorized'
      });
    }

    // Find current question index
    const currentIndex = session.questions.findIndex(
      q => q._id.toString() === session.currentQuestion?.toString()
    );

    if (currentIndex === -1 || currentIndex >= session.questions.length - 1) {
      return res.status(400).json({
        success: false,
        message: 'No more questions'
      });
    }

    // Set next question as current
    const nextQuestion = session.questions[currentIndex + 1];
    session.currentQuestion = nextQuestion._id;
    await session.save();

    // Emit new question to all participants
    req.io.to(sessionId).emit('question-update', {
      question: nextQuestion,
      questionNumber: currentIndex + 2,
      totalQuestions: session.questions.length
    });

    res.json({
      success: true,
      message: 'Next question loaded',
      question: {
        _id: nextQuestion._id,
        text: nextQuestion.text,
        questionNumber: currentIndex + 2,
        totalQuestions: session.questions.length
      }
    });
  } catch (error) {
    console.error('Next question error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error loading next question'
    });
  }
});

module.exports = router;
