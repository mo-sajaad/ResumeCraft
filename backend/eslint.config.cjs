const path = require('node:path');

const modulesRoot = path.join(__dirname, 'modules');

// Returns the module a path belongs to, or null if it is outside modules/.
function moduleNameOf(filePath) {
  const relative = path.relative(modulesRoot, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep)[0];
}

function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

// Files in one module may not load files from another, through require() or
// import. Known limits: computed paths are not checked, and neither are links
// through code outside modules/ (services/, controllers/, routes/, ...).
const noCrossModuleImports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      crossModule: "Module '{{from}}' must not load '{{source}}' from module '{{to}}'.",
    },
  },
  create(context) {
    const from = moduleNameOf(context.filename);
    if (!from) return {};

    function check(sourceNode) {
      const source = staticString(sourceNode);
      if (!source || !(source.startsWith('.') || path.isAbsolute(source))) return;

      const to = moduleNameOf(path.resolve(path.dirname(context.filename), source));
      if (to && to !== from) {
        context.report({ node: sourceNode, messageId: 'crossModule', data: { from, to, source } });
      }
    }

    function isRequire(callee) {
      if (callee.type === 'Identifier') return callee.name === 'require';
      // module.require(...) and require.resolve(...)
      return callee.type === 'MemberExpression'
        && callee.object.type === 'Identifier'
        && ((callee.object.name === 'module' && callee.property.name === 'require')
          || (callee.object.name === 'require' && callee.property.name === 'resolve'));
    }

    return {
      CallExpression(node) {
        if (isRequire(node.callee)) check(node.arguments[0]);
      },
      ImportExpression(node) { check(node.source); },
      ImportDeclaration(node) { check(node.source); },
      ExportNamedDeclaration(node) { check(node.source); },
      ExportAllDeclaration(node) { check(node.source); },
    };
  },
};

module.exports = [
  {
    files: ['modules/*/**/*.{js,cjs,mjs}'],
    plugins: { boundaries: { rules: { 'no-cross-module-imports': noCrossModuleImports } } },
    rules: {
      'boundaries/no-cross-module-imports': 'error',
    },
  },
];
