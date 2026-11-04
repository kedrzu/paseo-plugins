import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'bun:test';
import { readNxJson } from 'nx/src/config/nx-json.js';
import type { ProjectGraph } from 'nx/src/config/project-graph.js';
import { HashPlanInspector } from 'nx/src/hasher/hash-plan-inspector.js';
import { createProjectGraphAsync } from 'nx/src/project-graph/project-graph.js';
import { workspaceRoot } from 'nx/src/utils/workspace-root.js';

/**
 * Gitignored files that change a build's output. Each must be hashed by a `runtime` input of the
 * listed tasks — a fileset cannot see a gitignored file. Add a row with every such input.
 */
const GITIGNORED_INPUTS: GitignoredInput[] = [
    // { file: 'packages/app/.env', tasks: ['@paseo-plugins/app:build'] },
];

/** A source file of an nzyme package the product's projects depend on. */
const NZYME_PROBE = 'nzyme/packages/utils/src/index.ts';

interface GitignoredInput {
    /** Workspace-relative path of the file. */
    file: string;

    /** `project:target` ids whose cache key must change with the file. */
    tasks: string[];
}

interface CachedTask {
    /** `project:target`, e.g. `@scope/app:build`. */
    id: string;

    /** Workspace-relative path of the project, e.g. `packages/app`. */
    projectRoot: string;

    /** Workspace-relative paths of the files Nx hashes for this task. */
    files: string[];

    /** `runtime` input commands Nx runs for this task. */
    runtime: string[];

    /** Workspace-relative paths of the projects the task's project depends on, transitively. */
    dependencyRoots: string[];
}

// Resolving the inputs builds the whole project graph, so every assertion shares one run.
test('every cached Nx task is invalidated by its own sources, the nzyme packages it uses and its gitignored inputs', async () => {
    const tasks = await resolveCachedTasks();
    expect(tasks.length).toBeGreaterThan(0);

    // A namedInputs edit that drops a project's own files (a malformed extglob once collapsed
    // `production` to nothing) leaves a task that never misses the cache.
    expect(tasks.filter(task => !task.files.some(file => isOwnSource(task, file))).map(task => task.id)).toEqual([]);
    expect(tasks.filter(task => task.id.endsWith(':build')).flatMap(task => task.files.filter(isTestFile))).toEqual([]);

    // nzyme's packages are workspace projects: a product task over one hashes its files through `^` inputs.
    const overNzyme = tasks.filter(
        task =>
            !task.projectRoot.startsWith('nzyme/') &&
            task.dependencyRoots.some(root => NZYME_PROBE.startsWith(`${root}/`)),
    );
    expect(overNzyme.filter(task => !task.files.includes(NZYME_PROBE)).map(task => task.id)).toEqual([]);

    for (const input of GITIGNORED_INPUTS) {
        const covered = tasks.filter(task => input.tasks.includes(task.id));
        expect(covered.map(task => task.id).toSorted()).toEqual(input.tasks.toSorted());
        expect(tasksBlindTo(covered, input.file)).toEqual([]);
    }
});

async function resolveCachedTasks(): Promise<CachedTask[]> {
    const nxJson = readNxJson();
    // A `targetDefaults` value is a config object or an array of filtered entries, each with its own `cache`.
    const cachedTargets = Object.entries(nxJson.targetDefaults ?? {})
        .filter(([, config]) =>
            Array.isArray(config) ? config.some(entry => entry.cache === true) : config.cache === true,
        )
        .map(([target]) => target);

    const graph = await createProjectGraphAsync({ exitOnError: false });
    const inspector = new HashPlanInspector(graph);
    await inspector.init();

    const tasks: CachedTask[] = [];
    for (const [project, node] of Object.entries(graph.nodes)) {
        for (const target of cachedTargets) {
            if (!node.data.targets?.[target]) {
                continue;
            }
            const id = `${project}:${target}`;
            const inputs = inspector.inspectTaskInputs({ project, target }, {}, undefined, true)[id];
            if (inputs) {
                tasks.push({
                    id,
                    projectRoot: node.data.root,
                    files: inputs.files,
                    runtime: inputs.runtime,
                    dependencyRoots: dependenciesOf(graph, project).map(name => graph.nodes[name]?.data.root ?? name),
                });
            }
        }
    }
    return tasks;
}

/** Names of the projects `project` depends on, transitively. */
function dependenciesOf(graph: ProjectGraph, project: string): string[] {
    const seen = new Set<string>();
    const queue = [project];
    for (const current of queue) {
        for (const dependency of graph.dependencies[current] ?? []) {
            if (!seen.has(dependency.target)) {
                seen.add(dependency.target);
                queue.push(dependency.target);
            }
        }
    }
    return [...seen];
}

/**
 * Changes `file` (or creates it), and returns the ids of the tasks none of whose runtime commands
 * print anything different. The file is restored before returning.
 */
function tasksBlindTo(tasks: readonly CachedTask[], file: string): string[] {
    const commands = [...new Set(tasks.flatMap(task => task.runtime))];
    const before = new Map(commands.map(command => [command, runCommand(command)]));

    const absolute = path.join(workspaceRoot, file);
    const original = existsSync(absolute) ? readFileSync(absolute) : undefined;
    try {
        // A trailing newline keeps the file valid whatever its format.
        writeFileSync(absolute, Buffer.concat([original ?? Buffer.from('NX_INPUTS_GUARD=1'), Buffer.from('\n')]));
        const changed = new Set(commands.filter(command => runCommand(command) !== before.get(command)));
        return tasks.filter(task => !task.runtime.some(command => changed.has(command))).map(task => task.id);
    } finally {
        if (original === undefined) {
            rmSync(absolute);
        } else {
            writeFileSync(absolute, original);
        }
    }
}

/** Runs a runtime input the way Nx does: through a shell, from the workspace root. */
function runCommand(command: string): string {
    const result = Bun.spawnSync(['sh', '-c', command], { cwd: workspaceRoot });
    if (result.exitCode !== 0) {
        throw new Error(`Runtime input failed (${result.exitCode}): ${command}\n${result.stderr.toString()}`);
    }
    return result.stdout.toString();
}

/** A file of the task's project other than its config, which Nx hashes whatever the inputs say. */
function isOwnSource(task: CachedTask, file: string): boolean {
    return (
        file.startsWith(`${task.projectRoot}/`) &&
        file !== `${task.projectRoot}/package.json` &&
        file !== `${task.projectRoot}/project.json`
    );
}

function isTestFile(file: string): boolean {
    return /\.(test|spec)\.[jt]sx?$/.test(file);
}
