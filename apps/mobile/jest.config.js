module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/__tests__'],
  testRegex: '\.test\.tsx?$',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  modulePaths: ['<rootDir>/node_modules'],
};
