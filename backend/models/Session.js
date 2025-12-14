const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const sessionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4().substring(0, 6).toUpperCase()
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    enum: ['istorie', 'matematica', 'romana', 'geografie', 'biologie', 
           'fizica', 'chimie', 'engleza', 'informatica', 'franceza',
           'educatie_fizica', 'educatie_plastică', 'muzica', 'other']
  },
  grade: {
    type: Number,
    min: 1,
    max: 12
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'waiting', 'started', 'paused', 'ended'],
    default: 'draft'
  },
  settings: {
    timePerQuestion: {
      type: Number,
      default: 20,
      min: 5,
      max: 60
    },
    maxPlayers: {
      type: Number,
      default: 50,
      min: 2,
      max: 100
    },
    teamAssignment: {
      type: String,
      enum: ['auto', 'manual', 'random'],
      default: 'auto'
    },
    showLeaderboard: {
      type: Boolean,
      default: true
    },
    allowRejoin: {
      type: Boolean,
      default: true
    }
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }],
  currentQuestion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    team: {
      type: String,
      enum: ['red', 'blue'],
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    score: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  scores: {
    red: {
      type: Number,
      default: 0
    },
    blue: {
      type: Number,
      default: 0
    }
  },
  gameHistory: [{
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    redAnswers: {
      correct: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    blueAnswers: {
      correct: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    }
  }],
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
sessionSchema.index({ code: 1 });
sessionSchema.index({ teacher: 1 });
sessionSchema.index({ status: 1 });
sessionSchema.index({ createdAt: -1 });

// Virtual for active participants count
sessionSchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

// Virtual for total questions count
sessionSchema.virtual('totalQuestions').get(function() {
  return this.questions.length;
});

// Pre-save middleware to update timestamps
sessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Update start/end times based on status
  if (this.isModified('status')) {
    if (this.status === 'started' && !this.startTime) {
      this.startTime = Date.now();
    } else if ((this.status === 'ended' || this.status === 'paused') && !this.endTime) {
      this.endTime = Date.now();
    }
  }
  
  next();
});

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
