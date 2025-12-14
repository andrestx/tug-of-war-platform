const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  answers: [{
    type: String,
    required: true,
    trim: true
  }],
  correctAnswer: {
    type: Number,
    required: true,
    min: 0,
    max: 3
  },
  explanation: {
    type: String,
    trim: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  points: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  },
  order: {
    type: Number,
    default: 0
  },
  imageUrl: {
    type: String,
    trim: true
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

// Index for better query performance
questionSchema.index({ session: 1, order: 1 });

// Virtual for formatted answers
questionSchema.virtual('formattedAnswers').get(function() {
  return this.answers.map((answer, index) => ({
    letter: String.fromCharCode(65 + index),
    text: answer,
    isCorrect: index === this.correctAnswer
  }));
});

// Pre-save middleware to update timestamps
questionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
