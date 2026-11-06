// `reference/errors.mdx` is the one page that quotes library error messages verbatim, in
// ```text blocks. This check fails when one of those blocks no longer matches a message
// in the library source, and when any other page quotes a library message in a ```text
// block instead of linking to errors.mdx. Inline code and prose are not checked.
//
// Messages are read from the source rather than produced by running it: the argument of
// every `new Error(...)` is evaluated statically (string literals, `+`, template
// literals, and top-level `const` strings in the same file). Anything else, such as
// `${target.name}`, becomes a wildcard. A message with fewer than MIN_LITERAL_CHARS
// literal characters is ignored, so a generic `${prefix}: ${detail}` cannot match every
// quote on the site. A message built in a shape this file cannot evaluate therefore
// drops out, and its errors.mdx block then fails to match: loud, never silent.
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libraryRoot = resolve(docsRoot, '../../packages/convex-angular');
const contentDir = join(docsRoot, 'src/content/docs');
const errorsPage = join(contentDir, 'reference/errors.mdx');

const WILDCARD = '\0';
const MIN_LITERAL_CHARS = 20;
const MIN_MESSAGES = 10;

async function walk(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(full, predicate);
      }
      return predicate(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

function errorMessages(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  const constants = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }

  function evaluate(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isParenthesizedExpression(node)) {
      return evaluate(node.expression);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return evaluate(node.left) + evaluate(node.right);
    }
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans.map((span) => evaluate(span.expression) + span.literal.text).join('');
    }
    if (ts.isIdentifier(node) && constants.has(node.text)) {
      return evaluate(constants.get(node.text));
    }
    return WILDCARD;
  }

  const messages = [];
  (function visit(node) {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Error') {
      const [argument] = node.arguments ?? [];
      if (argument) {
        messages.push(evaluate(argument));
      }
    }
    ts.forEachChild(node, visit);
  })(sourceFile);
  return messages;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sourceFiles = (
  await Promise.all(
    ['src', 'testing/src', 'better-auth/src'].map((dir) =>
      walk(join(libraryRoot, dir), (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts')),
    ),
  )
).flat();

const matchers = [];
for (const file of sourceFiles) {
  for (const message of errorMessages(file, await readFile(file, 'utf8'))) {
    if (message.replaceAll(WILDCARD, '').length >= MIN_LITERAL_CHARS) {
      matchers.push(new RegExp(`^${message.split(WILDCARD).map(escapeRegExp).join('.+')}$`));
    }
  }
}

if (matchers.length < MIN_MESSAGES) {
  console.error(`Found only ${matchers.length} library error messages; the extraction in this script is broken.`);
  process.exit(1);
}

const textBlocks = (source) => [...source.matchAll(/^```text\n([\s\S]*?)\n```$/gm)].map((match) => match[1]);
const isLibraryMessage = (block) => matchers.some((matcher) => matcher.test(block));
const firstLine = (block) => block.split('\n')[0].slice(0, 100);

const problems = [];
const pages = await walk(contentDir, (name) => name.endsWith('.mdx') || name.endsWith('.md'));
for (const page of pages) {
  const blocks = textBlocks(await readFile(page, 'utf8'));
  const label = relative(docsRoot, page);
  for (const block of blocks) {
    if (page === errorsPage && !isLibraryMessage(block)) {
      problems.push(`${label}: quoted message not found in the library source: "${firstLine(block)}"`);
    }
    if (page !== errorsPage && isLibraryMessage(block)) {
      problems.push(`${label}: quotes a library message; link to reference/errors instead: "${firstLine(block)}"`);
    }
  }
  if (page === errorsPage && blocks.length === 0) {
    problems.push(`${label}: no \`\`\`text blocks found; the check is not looking at the right page.`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(
  `Error quotes match the library source (${matchers.length} messages checked against ${pages.length} pages).`,
);
