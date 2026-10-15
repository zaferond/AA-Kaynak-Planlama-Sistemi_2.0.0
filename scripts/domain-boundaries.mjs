import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const excludedDirectories = new Set(["node_modules", ".git"]);
// Domain dependencies must be portable and explicitly reviewed. Zod is the
// existing schema library; application, platform and presentation imports stay out.
const allowedPackages = new Set(["zod"]);

/** Read source only. No inspected module is imported, transpiled or executed. */
export async function checkSharedDependencies(root) {
  const shared = path.join(root, "shared");
  const files = [];
  const violations = [];
  const relative = (file) =>
    path.relative(root, file).split(path.sep).join("/");
  const add = (file, line, column, reason) =>
    violations.push({ file: relative(file), line, column, reason });

  async function walk(directory) {
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      add(directory, 1, 1, "Shared source directory must not be a symlink.");
      return;
    }
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, "en"),
    );
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        add(file, 1, 1, "Shared source must not be a symlink.");
      else if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) await walk(file);
      } else if (entry.isFile() && sourceExtension.test(entry.name))
        files.push(file);
    }
  }
  await walk(shared);

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    const kind = file.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : file.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : /\.[cm]?js$/i.test(file)
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    function fail(position, reason) {
      const { line, character } = ast.getLineAndCharacterOfPosition(position);
      add(file, line + 1, character + 1, reason);
    }
    function dependency(text, position) {
      const portable = text.replaceAll("\\", "/");
      if (/^\.{1,2}(?:\/|$)/.test(portable)) {
        const target = path.resolve(path.dirname(file), portable);
        const within = path.relative(shared, target);
        if (
          within !== ".." &&
          !within.startsWith(".." + path.sep) &&
          !path.isAbsolute(within) &&
          !within.split(path.sep).some((part) => excludedDirectories.has(part))
        )
          return;
        fail(position, "Dependency leaves the checked shared domain.");
      } else if (!allowedPackages.has(text))
        fail(
          position,
          "Package, alias or platform dependency is not allowed in shared.",
        );
    }
    function literal(node, owner) {
      if (
        node &&
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      )
        dependency(node.text, node.getStart(ast));
      else
        fail(
          owner.getStart(ast),
          "Computed dependency cannot be checked in shared.",
        );
    }
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) literal(node.moduleSpecifier, node);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        literal(node.moduleReference.expression, node);
      else if (ts.isImportTypeNode(node)) {
        const argument = node.argument;
        literal(
          ts.isLiteralTypeNode(argument) ? argument.literal : undefined,
          node,
        );
      } else if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const loader =
          expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(expression) && expression.text === "require") ||
          (ts.isPropertyAccessExpression(expression) &&
            ts.isIdentifier(expression.expression) &&
            ((expression.expression.text === "require" &&
              expression.name.text === "resolve") ||
              (expression.expression.text === "module" &&
                expression.name.text === "require")));
        if (loader) literal(node.arguments[0], node);
      }
      ts.forEachChild(node, visit);
    }
    for (const diagnostic of ast.parseDiagnostics)
      fail(diagnostic.start ?? 0, "Shared source could not be parsed.");
    for (const reference of ast.referencedFiles)
      dependency(reference.fileName, reference.pos);
    for (const reference of ast.typeReferenceDirectives)
      dependency(reference.fileName, reference.pos);
    visit(ast);
  }
  return { files: files.map(relative), violations };
}
