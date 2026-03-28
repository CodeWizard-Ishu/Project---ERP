module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'perf', 'ci', 'build', 'revert'],
    ],
    'subject-max-length': [2, 'always', 100],
  },
};
