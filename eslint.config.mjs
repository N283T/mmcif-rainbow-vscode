import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
    {
        ignores: ['dist/**', 'node_modules/**', '*.d.ts']
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                project: './tsconfig.json'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'class',
                    format: ['PascalCase']
                },
                {
                    selector: 'interface',
                    format: ['PascalCase']
                },
                {
                    selector: 'typeAlias',
                    format: ['PascalCase']
                }
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            'no-console': 'warn',
            'eqeqeq': ['error', 'always'],
            'curly': ['warn', 'all'],
            'semi': ['error', 'always']
        }
    }
];
