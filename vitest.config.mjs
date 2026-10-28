import { defineConfig } from 'vitest/config';

export default defineConfig({
    // The components are JSX in plain .js files (Next.js allows that, Vite does not by
    // default) — without this a component test dies in the import analysis, not in the test.
    oxc: {
        // .js is not in Vite's default transform list; add it (our code only).
        include: /\.js$/,
        exclude: /node_modules/,
        lang: 'jsx',
        jsx: { runtime: 'automatic' },
    },
    test: {
        environment: 'node',
        include: ['**/*.test.js'],
        exclude: ['node_modules/**', '.next/**'],
    },
});
