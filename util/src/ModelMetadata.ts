import * as fs from "fs";

import { Model } from "./Model";
import { Licenses } from "./Licenses";
import { Models } from "./Models";
import { Issues } from "./Issues";
import { Listings } from "./Listings";
import { Listing } from "./Listing";

/**
 * The main class for the model metadata processing
 */
export class ModelMetadata {
  /**
   * The URL for the glTF-Sample-Viewer release
   */
  static readonly UrlSampleViewer =
    "https://github.khronos.org/glTF-Sample-Viewer-Release/";

  /**
   * The URL of the "raw" glTF-Sample-Assets repo
   */
  static readonly UrlModelRepoRaw =
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main";

  /**
   * The directory relative to root containing all models
   */
  private static readonly ModelDirectory = "./Models";

  /**
   * Whether verbose information about intermediate steps should be printed
   */
  static verbose = false;

  /**
   * Whether to omit actually writing any file
   */
  static dryRun = false;

  /**
   * Process the specified models with the given options.
   *
   * @param options - The options
   * @param inputModelNames - The input model (subdirectory) names
   * @returns An error code, 0 if there is no error
   */
  static process(
    options: Record<string, boolean>,
    inputModelNames: string[]
  ): number {
    ModelMetadata.verbose = options["verbose"] === true;
    ModelMetadata.dryRun = options["dry-run"] === true;
    const check = options["check"] === true;
    const update = options["update"] === true;

    const baseDirectory = ModelMetadata.ModelDirectory;

    // Get list of all model directory names to process
    let modelNames = inputModelNames;
    if (modelNames.length === 0) {
      modelNames = ModelMetadata.collectSubdirectoryNames(baseDirectory);
    }

    // Create all models
    const modelIssues: Record<string, Issues> = {};
    const models = Models.createModels(baseDirectory, modelNames, modelIssues);

    // If there are any errors (or if 'check' was requested),
    // print all issues.
    let anyHasErrors = false;
    for (const i of Object.values(modelIssues)) {
      anyHasErrors = anyHasErrors || i.errors.length > 0;
    }
    if (anyHasErrors || check) {
      for (const [m, i] of Object.entries(modelIssues)) {
        ModelMetadata.printIssues(m, i);
      }
    }
    if (anyHasErrors) {
      return 1;
    }

    //ModelMetadata.DEBUG_preprocessModels(models);

    // Creating the listing and overview files can only be done
    // when all models are processed
    if (inputModelNames.length !== 0) {
      return 0;
    }

    ModelMetadata.createListings(baseDirectory, models);
    ModelMetadata.createModelIndex(baseDirectory, models);
    ModelMetadata.createReuseLicense(baseDirectory, models);

    if (update) {
      ModelMetadata.updateAllModelsFiles(baseDirectory, models);
    }
    return 0;
  }

  // Internal, preliminary tests
  //@ts-ignore
  private static DEBUG_preprocessModels(models: Model[]) {
    const knownTags = [
      "showcase",
      "video",
      "extension",
      "core",
      "testing",
      "written",
      "issues",
      "pbrtest",
    ];

    const allExtensions = new Set<string>();
    const allTags = new Set<String>();
    for (const model of models) {
      const extensionsUsed = model.getExtensionsUsed();
      const tags = model.getTags();
      for (const t of tags) {
        allTags.add(t);
      }
      for (const e of extensionsUsed) {
        allExtensions.add(e);
      }

      if (tags.includes("core") && extensionsUsed.length > 0) {
        console.log(
          `Model ${model.getName()} is tagged as 'core' but uses ${extensionsUsed}`
        );
      }
      for (const tag of tags) {
        if (!knownTags.includes(tag)) {
          console.log(`Model ${model.getName()} uses unknown tag '${tag}'`);
        }
      }
    }
    console.log("All extensions:");
    for (const e of allExtensions) {
      console.log(e);
    }
    console.log("All tags:");
    for (const t of allTags) {
      console.log(t);
    }
  }

  /**
   * Create the so-called "Listings" for the given models.
   *
   * These are the markdown files that list all models that have
   * a certain tag, e.g. "Models-showcase.md".
   *
   * These listings are defined in the "Listings" class.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param models - The models
   */
  private static createListings(baseDirectory: string, models: Model[]) {
    const listings = Listings.LISTINGS;
    for (const listing of listings) {
      const listingReadme = ModelMetadata.createListingMarkdown(
        baseDirectory,
        listing,
        models
      );
      const listingFileName = `${baseDirectory}/${listing.file}`;

      if (ModelMetadata.dryRun) {
        ModelMetadata.logVerbose(
          `Skip writing ${listingFileName} due to dry-run`
        );
      } else {
        ModelMetadata.logVerbose(`Writing ${listingFileName}`);
        fs.writeFileSync(listingFileName, listingReadme);
      }
    }
  }

  /**
   * Create the markdown string for one "Listing" file.
   *
   * Such a listing file is, for example, "Models-showcase.md", which
   * contains a table of all models that are tagged with "showcase".
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param listing - The Listing object
   * @param models - The models
   * @returns The markdown
   */
  private static createListingMarkdown(
    baseDirectory: string,
    listing: Listing,
    models: Model[]
  ): string {
    ModelMetadata.logVerbose(`Creating markdown for ${listing.file}...`);

    const md: string[] = [];

    // Header
    md.push("# glTF 2.0 Sample Assets");
    md.push("");
    const tags = listing.tags;
    if (tags.length === 0) {
      md.push("## All models");
    } else {
      md.push(`## Models tagged with '**${tags.join(", ")}**'`);
    }
    md.push("");
    md.push(listing.summary);
    md.push("");

    // List of links to all other 'Listings':
    md.push("## Other Tagged Listings");
    md.push("");
    const listings = Listings.LISTINGS;
    for (const otherListing of listings) {
      let tagItem = "";
      if (otherListing.tags.length > 0) {
        tagItem = "#" + otherListing.tags.join(", #");
      } else {
        tagItem = "#all";
      }
      const line = `* [${tagItem}](${otherListing.file}) - ${otherListing.summary}`;
      md.push(line);
    }
    md.push("");

    // The actual table containing the models.
    md.push("| Model   | Description |");
    md.push("|---------|-------------|");

    let counter = 0;
    for (const modelMeta of models) {
      const modelTags = modelMeta.getTags();
      const isListed = ModelMetadata.includesAll(modelTags, tags);
      if (!isListed) {
        continue;
      }
      counter++;

      // Create one row for the table:

      const row = [];
      row.push("| ");

      // Model name, linking to README
      row.push(
        `[${modelMeta.getName()}](${modelMeta.getModelUrl()}/README.md)`
      );
      row.push("<br>");

      // Model screenshot, linking to README
      row.push(
        `[![${modelMeta.getName()}](${modelMeta.getScreenshotUrl()})](${modelMeta.getModelUrl()}/README.md)`
      );
      row.push("<br>");

      // The "Show" link for the sample viewer
      const pathModel = modelMeta.hasGlb
        ? modelMeta.getGlbUrl()
        : modelMeta.getGltfUrl();
      row.push(
        `[Show](${ModelMetadata.UrlSampleViewer}?model=${ModelMetadata.UrlModelRepoRaw}/${baseDirectory}/${pathModel}) `
      );

      // The "Download GLB" link
      if (modelMeta.hasGlb) {
        row.push(
          `-- [Download GLB](${
            ModelMetadata.UrlModelRepoRaw
          }/${baseDirectory}/${modelMeta.getGlbUrl()}) `
        );
      }

      // Right side:
      // Summary
      row.push(`| `);
      const summary = modelMeta.getSummary();
      row.push(`${summary}<br>`);

      // Credits
      row.push(`Credit:<br>`);
      const credits = modelMeta.createCreditsMarkdownLines();
      row.push(`${credits.join("<br>")}`);
      row.push(` |`);

      md.push(row.join(""));
    }

    // Footer
    md.push("---");
    md.push("");
    md.push(`### Copyright\n\n&copy; 2023, The Khronos Group.`);
    md.push("");

    const license = Licenses.LICENSE["CC-BY-4.0"];
    md.push(`**License:** [${license.text}](${license.link})`);
    md.push("");
    md.push(
      `<!-- This file is auto-generated by modelmetadata. Do not edit by hand. -->`
    );
    md.push("");

    const result = md.join("\n");
    ModelMetadata.logVerbose(
      `Creating markdown for ${listing.file} DONE, ${counter} models`
    );
    return result;
  }

  /**
   * Create the 'model-index.json' file that summarizes the names, screenshots,
   * tags, and variants of all models, in a machine-processable form.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param models - The models
   */
  private static createModelIndex(baseDirectory: string, models: Model[]) {
    const modelIndexJson = ModelMetadata.createModelIndexJson(models);
    const indexFileName = `${baseDirectory}/model-index.json`;
    const modelIndexJsonString = JSON.stringify(modelIndexJson, null, 2);

    if (ModelMetadata.dryRun) {
      ModelMetadata.logVerbose(`Skip writing ${indexFileName} due to dry-run`);
    } else {
      ModelMetadata.logVerbose(`Writing ${indexFileName}`);
      fs.writeFileSync(indexFileName, modelIndexJsonString);
    }
  }

  /**
   * Create the JSON object that goes into the 'model-index.json' file that
   * summarizes the names, screenshots, tags, and variants of all models,
   * in a machine-processable form.
   *
   * @param models - The models
   * @returns The model index JSON object
   */
  private static createModelIndexJson(models: Model[]): any {
    ModelMetadata.logVerbose(
      `Creating model index for ${models.length} models...`
    );
    const modelIndex = [];

    for (const model of models) {
      const modelJson: any = {};
      modelJson.label = model.getName();
      modelJson.name = model.getModelPath();
      modelJson.screenshot = model.getScreenshotName();

      const tags = model.getTags();
      if (tags.length !== 0) {
        modelJson.tags = tags;
      }

      modelJson.variants = {};
      const variants = model.getVariants();
      for (const [folder, file] of Object.entries(variants)) {
        modelJson.variants[folder] = file;
      }
      modelIndex.push(modelJson);
    }
    ModelMetadata.logVerbose(
      `Creating model index for ${models.length} models DONE`
    );
    return modelIndex;
  }

  /**
   * Create the "./.reuse/dep5" file that aggregates the license information
   * for all models.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param models - The models
   */
  private static createReuseLicense(baseDirectory: string, models: Model[]) {
    const dep = ModelMetadata.createDep5(baseDirectory, models);
    const depFileName = `./.reuse/dep5`;

    if (ModelMetadata.dryRun) {
      ModelMetadata.logVerbose(`Skip writing ${depFileName} due to dry-run`);
    } else {
      ModelMetadata.logVerbose(`Writing ${depFileName}`);
      fs.writeFileSync(depFileName, dep);
    }
  }

  /**
   * Create the contents of the "./.reuse/dep5" file that aggregates
   * the license information for all models.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param models - The models
   * @returns The contents of the file
   */
  private static createDep5(baseDirectory: string, models: Model[]): string {
    ModelMetadata.logVerbose(`Creating dep5 for ${models.length} models...`);

    const dep = [];

    dep.push(
      "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/"
    );
    dep.push(
      "Source: glTF V2.0 models from various sources collected into a Repo"
    );
    dep.push("Upstream-Name: glTF V2.0 Model Repo");
    dep.push(
      "Upstream-Contact: https://GitHub.com/KhronosGroup/glTF-Sample-Models/"
    );
    dep.push("Copyright: 2017-2023 Khronos Group");
    dep.push("License: CC-BY-4.0");
    dep.push("");
    dep.push("Files: *");
    dep.push("Copyright: 2017-2023 Khronos Group");
    dep.push("License: CC-BY-4.0");
    dep.push("");

    for (const model of models) {
      const files = `${baseDirectory}/${model.getModelPath()}`;
      dep.push(`Files: ${files.substring(2)}/*`);

      const copyright: string[] = [];
      const license: string[] = [];
      let licenseLast = "";

      const legals = model.getLegals();
      for (const legal of legals) {
        const year = legal.year;
        const owner = legal.owner;
        copyright.push(`${year} ${owner}`);
        if (legal.license !== licenseLast) {
          license.push(legal.license);
          licenseLast = legal.license;
        }
      }

      dep.push(`Copyright: \n ${copyright.join("\n ")}`);
      dep.push(`License: ${license.join(" AND ")}`);
      dep.push("");
    }

    const result = dep.join("\n");

    ModelMetadata.logVerbose(`Creating dep5 for ${models.length} models DONE`);
    return result;
  }

  /**
   * Update all auto-generated files for all models.
   *
   * See updateModelFiles for details.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param models - The models
   */
  private static updateAllModelsFiles(baseDirectory: string, models: Model[]) {
    for (const model of models) {
      ModelMetadata.updateModelFiles(baseDirectory, model);
    }
  }

  /**
   * Update all auto-generated files for the given model.
   *
   * This will write the latest state of the 'metadata.json',
   * the 'README.md', and the 'LICENSE.md' for the given model.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param model - The model
   */
  private static updateModelFiles(baseDirectory: string, model: Model) {
    ModelMetadata.logVerbose(`Update model files for ${model.getName()}...`);

    const dir = `${baseDirectory}/${model.getModelPath()}`;

    const metadata = model.getMetadata();
    const metadataString = JSON.stringify(metadata, null, 2);
    const metadataFileName = `${dir}/metadata.json`;
    if (ModelMetadata.dryRun) {
      ModelMetadata.logVerbose(
        `  Skip writing ${metadataFileName} due to dry-run`
      );
    } else {
      ModelMetadata.logVerbose(`  Writing ${metadataFileName}`);
      fs.writeFileSync(metadataFileName, metadataString, "utf8");
    }

    const readmeMd = model.createReadmeMarkdown(baseDirectory);
    if (readmeMd !== undefined) {
      const readmeFileName = `${dir}/README.md`;
      if (ModelMetadata.dryRun) {
        ModelMetadata.logVerbose(
          `  Skip writing ${readmeFileName} due to dry-run`
        );
      } else {
        ModelMetadata.logVerbose(`  Writing ${readmeFileName}`);
        fs.writeFileSync(readmeFileName, readmeMd, "utf8");
      }
    }

    const licenseMd = model.createLicenseMarkdown();
    const licenseFileName = `${dir}/LICENSE.md`;
    if (ModelMetadata.dryRun) {
      ModelMetadata.logVerbose(
        `  Skip writing ${licenseFileName} due to dry-run`
      );
    } else {
      ModelMetadata.logVerbose(`  Writing ${licenseFileName}`);
      fs.writeFileSync(licenseFileName, licenseMd, "utf8");
    }

    ModelMetadata.logVerbose(`Update model files for ${model.getName()} DONE`);
  }

  /**
   * Log the given data if verbose output was enabled
   *
   * @param data - The data
   */
  private static logVerbose(...data: any[]) {
    if (ModelMetadata.verbose) {
      console.log(...data);
    }
  }

  /**
   * Print the given issues
   *
   * @param modelName - The name of the model
   * @param issues - The issues
   */
  private static printIssues(modelName: string, issues: Issues) {
    const errors = issues.errors;
    const warnings = issues.warnings;
    if (errors.length > 0 || warnings.length > 0) {
      console.log(
        `Model '${modelName}' caused  ${errors.length} errors and ${warnings.length} warnings:`
      );
      for (let i = 0; i < errors.length; i++) {
        console.log(` E-${i + 1}: ${errors[i]}`);
      }
      for (let i = 0; i < warnings.length; i++) {
        console.log(` W-${i + 1}: ${warnings[i]}`);
      }
    }
  }

  //--------------------------------------------------------------------------
  // Some basic helper functions

  /**
   * Collect the names of all subdirectories in the given folder.
   *
   * @param directory - The directory name
   * @returns The subdirectory names
   */
  private static collectSubdirectoryNames(directory: string = ""): string[] {
    if (directory === "") {
      console.log(`Invalid directory name: '${directory}'`);
      return [];
    }
    if (!fs.existsSync(directory)) {
      console.log(`Directory does not exist: '${directory}'`);
      return [];
    }
    const subdirectoryNames: string[] = [];
    const files = fs.readdirSync(directory);
    for (const file of files) {
      const modelPath = `${directory}/${file}`;
      if (fs.lstatSync(modelPath).isDirectory()) {
        subdirectoryNames.push(file);
      }
      7;
    }
    subdirectoryNames.sort();
    return subdirectoryNames;
  }

  /**
   * Pragmatically read the JSON from the specified file. If the
   * file does not exist, a message is printed and 'undefined' is
   * returned.
   *
   * @param fileName - The file name
   * @returns The parsed result
   */
  static readJson(fileName: string): any {
    if (fs.existsSync(fileName)) {
      const jsonString = fs.readFileSync(fileName, "utf8").toString();
      return JSON.parse(jsonString);
    }
    console.log(`File ${fileName} does not exist`);
    return undefined;
  }

  /**
   * Returns whether the given including array contains all elements
   * from the included array.
   *
   * @param including - The including array
   * @param included - The included elements
   * @returns Whether all are included
   */
  private static includesAll<T>(including: T[], included: T[]) {
    for (const i of included) {
      if (!including.includes(i)) {
        return false;
      }
    }
    return true;
  }
}
