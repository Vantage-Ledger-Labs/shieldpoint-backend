"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/*.spec.ts'],
    moduleNameMapper: {
      '(\\.{1,2}/)+stellar/stellar\\.service': '<rootDir>/src/modules/proofs/__mocks__/stellar.service.ts',
    },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, diagnostics: false }],
    },
};
exports.default = config;
//# sourceMappingURL=jest.config.js.map