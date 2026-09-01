// Chequeo de código del proyecto. Existe por un motivo concreto: en un
// mismo día, tres veces, `npm run build` pasó limpio con un import que
// faltaba — SeccionPlegable en Alumnos, supabase en Clientes y showToast
// en Pago trabajadores. Las tres habrían reventado la pantalla al
// tocarla, en producción.
//
// Vite no falla por identificadores no definidos: solo por errores de
// sintaxis. Compila `foo()` sin preguntar si `foo` existe. La regla
// no-undef es la que atrapa exactamente eso, y por eso es la única que
// está en "error": lo demás avisa, pero no frena.
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "public/**", "scripts/**"],
  },
  {
    // El panel y las páginas públicas: corren en el navegador.
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      // Un import o una variable que quedó sin uso casi siempre es resto
      // de algo que se movió de lugar. Avisa, no frena: no vale la pena
      // bloquear un despliegue por eso.
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      // Las de hooks quedan en aviso a propósito. Son útiles, pero la app
      // ya tiene efectos escritos a conciencia con dependencias
      // deliberadamente incompletas (y su comentario explicando por qué);
      // ponerlas en error obligaría a rescribirlos todos de una vez.
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Las funciones serverless de Vercel: corren en Node, no en el
    // navegador. Sin esto, `process` y `fetch` darían falsos no-undef.
    files: ["api/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Los tests traen sus propios globales de Vitest.
    files: ["**/*.test.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
