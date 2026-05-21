import { ModelMetadata } from "./ModelMetadata";

/**
 * Simple type definition for a command line option
 */
type CommandLineOption = {
  /**
   * The long form, prefixed by two dashes
   */
  long: string;

  /**
   * The short form, a single letter prefixed by one dash
   */
  short: string;

  /**
   * A description, to be shown in the help output
   */
  text: string;
};

/**
 * Definition of all available command line options
 */
const commandLineOptions: CommandLineOption[] = [
  {
    long: "help",
    short: "h",
    text: "Displays this information.",
  },
  {
    long: "verbose",
    short: "v",
    text: "Dump intermediate and debug information.",
  },
  {
    long: "check",
    short: "c",
    text: "Checks consistency of the asset directory files.",
  },
  {
    long: "update",
    short: "u",
    text: 'Update model folders. It has no effect "check" fails. Will set "check".',
  },
  {
    long: "process-repo",
    short: "p",
    text: 'Create repo-wide files. Will set "check".',
  },
];

/**
 * Simple type definition for a parsed command line
 */
type ParsedCommandLine = {
  /**
   * A mapping from the 'long' form of an option to whether it was enabled
   */
  options: Record<string, boolean>;

  /**
   * The list of model names that may have been given explicitly.
   *
   * When this is empty, then it means that all models should be
   * processed.
   */
  modelNames: string[];
};

/**
 * Parses the command line arguments
 *
 * @param argv - The arguments
 * @returns The parsed command line
 */
function parseCommandLine(argv: string[]): ParsedCommandLine {
  const result: ParsedCommandLine = {
    options: {},
    modelNames: [],
  };

  //console.log("argv ", argv);

  // Note: 'argv[0]' and 'argv[1]' are the script names!
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    let wasOption = false;
    for (const option of commandLineOptions) {
      if (arg === `--${option.long}` || arg === `-${option.short}`) {
        result.options[option.long] = true;
        wasOption = true;
      }
    }
    if (!wasOption && arg !== undefined) {
      result.modelNames.push(arg);
    }
  }

  // Always check when update or process-repo is true
  if (result.options["update"]) {
    result.options["check"] = true;
  }
  if (result.options["process-repo"]) {
    result.options["check"] = true;
  }
  if (result.modelNames.length !== 0) {
    result.options["process-repo"] = false;
  }
  return result;
}

// Parse the command line arguments
const parsedCommandLine = parseCommandLine(process.argv);

// Check if help should be printed - either because it
// was requested, or neither the "process-repo" nor
// any model names had been given.
let shouldPrintHelp = parsedCommandLine.options["help"];
if (!parsedCommandLine.options["process-repo"]) {
  if (parsedCommandLine.modelNames.length === 0) {
    shouldPrintHelp = true;
  }
}

// If help was requested, print help and exit
if (shouldPrintHelp) {
  console.log(`main.ts [--options] [asset]`);
  for (const option of commandLineOptions) {
    console.log(` --${option.long.padEnd(16)} ${option.text}`);
  }
  console.log(
    ` ${"[asset]".padEnd(
      18
    )} Folder name in model directory to process (defaults to all)`
  );
  process.exit(0);
}

console.log("Parsed command line: ", parsedCommandLine);

// Go to the repo root, and run the processing
process.chdir("..");
ModelMetadata.process(parsedCommandLine.options, parsedCommandLine.modelNames);
