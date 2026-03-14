module.exports = [
  {
    files: ['modules/*/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          '../../identity/**',
          '../../billing/**',
          '../../documents/**',
          '../../career-intelligence/**',
          '../../admin/**',
          '../../../modules/identity/**',
          '../../../modules/billing/**',
          '../../../modules/documents/**',
          '../../../modules/career-intelligence/**',
          '../../../modules/admin/**',
        ],
      }],
    },
  },
];
