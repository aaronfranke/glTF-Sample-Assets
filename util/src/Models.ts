import * as fs from "fs";

import { Legal } from "./Legal";
import { Licenses } from "./Licenses";
import { Metadata } from "./Metadata";
import { Issues } from "./Issues";
import { Model } from "./Model";
import { ModelMetadata } from "./ModelMetadata";

/**
 * Methods related to 'Model' objects
 */
export class Models {
  static readonly MetadataJsonVersion = 2;

  /**
   * Create all models from the given names in the given base directory.
   *
   * This will create one model for each of the given names, if the
   * model input could successfully be read.
   *
   * If a model can not be created, then the corresponding entry
   * in the 'modelIssues' record will contain information about
   * the errors and warnings that prevented the model from being
   * created.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param modelNames The names (subdirectory names) of the models
   * @param modelIssues Will be filled with information about issues
   * @returns The models
   */
  static createModels(
    baseDirectory: string,
    modelNames: string[],
    modelIssues: Record<string, Issues>
  ): Model[] {
    const models: Model[] = [];
    for (const modelName of modelNames) {
      const issues = {
        errors: [],
        warnings: [],
      };
      const mm = Models.createModel(baseDirectory, modelName, issues);
      modelIssues[modelName] = issues;
      if (mm !== undefined) {
        models.push(mm);
      }
    }
    return models;
  }

  /**
   * Create the specified model.
   *
   * If the model cannot be created, then the given issues will afterwards
   * contain warning- and error messages, and 'undefined' will be returned.
   *
   * @param baseDirectory - The base directory ("./Models")
   * @param modelName The name (subdirectory name) of the model
   * @param issues Will be filled with information about issues
   * @returns The model
   */
  private static createModel(
    baseDirectory: string,
    modelName: string,
    issues: Issues
  ): Model | undefined {
    const errors = issues.errors;
    const modelPath = `${baseDirectory}/${modelName}`;

    // Read the raw metadata JSON
    const metadataFileName = `${modelPath}/metadata.json`;
    if (!fs.existsSync(metadataFileName)) {
      errors.push(`Model metadata file not found: ${metadataFileName}`);
      return undefined;
    }
    const metadataJson = ModelMetadata.readJson(metadataFileName);

    // That preprocessing thingy for the licenses...
    Models.updateLegacyLicenseStructure(metadataJson);

    // Insert default values for optional fields
    if (metadataJson.tags === undefined) {
      metadataJson.tags = [];
    }
    if (metadataJson.createReadme === undefined) {
      metadataJson.createReadme = true;
    }

    // Validate the metadata JSON, and bail out for errors
    Models.validateMetadataJson(metadataJson, issues);
    if (issues.errors.length > 0) {
      return undefined;
    }

    // Here, the metadata JSON should be a valid "Metadata"
    const metadata = metadataJson as Metadata;

    // Validate the metadata (e.g. presence of screenshots
    // and legal information), and bail out for errors
    Models.validateMetadata(modelPath, metadata, issues);
    if (issues.errors.length > 0) {
      return undefined;
    }

    // Actually create the model from the valid Metadata
    const model = new Model(modelName, metadata);
    model.initialize(baseDirectory, issues);
    if (issues.errors.length > 0) {
      return undefined;
    }

    // Return it if there have not been any errors
    return model;
  }

  /**
   * Validate the given object that was read from the metadata.json file.
   *
   * @param metadataJson - The metadata JSON
   * @param issues Will be filled with any issues
   */
  private static validateMetadataJson(
    metadataJson: any,
    issues: { errors: string[]; warnings: string[] }
  ) {
    const errors = issues.errors;

    const version = metadataJson.version;
    if (version === undefined) {
      errors.push(`The 'version' is required`);
    } else {
      const versionNumber = parseInt(version);
      if (versionNumber != Models.MetadataJsonVersion) {
        errors.push(
          `Expected version ${Models.MetadataJsonVersion}, but found ${version}`
        );
      }
    }

    const name = metadataJson.name;
    if (name === undefined) {
      errors.push("The 'name' is required");
    }
    const path = metadataJson.path;
    if (path === undefined) {
      errors.push("The 'path' is required");
    }
    const summary = metadataJson.summary;
    if (summary === undefined) {
      errors.push("The 'summary' is required");
    }
    const screenshot = metadataJson.screenshot;
    if (screenshot === undefined) {
      errors.push("The 'screenshot' is required");
    }
    const legal = metadataJson.legal;
    if (legal === undefined || !Array.isArray(legal)) {
      errors.push("The 'legal' must be an array");
    } else {
      for (let i = 0; i < legal.length; i++) {
        const element = legal[i];
        Models.validateLegalJson(element, issues);
      }
    }
  }

  /**
   * Validate the given 'metadata.legal' field as it was read
   * from the metadata.json file.
   *
   * @param legalJson - The legal JSON
   * @param issues Will be filled with any issues
   */
  private static validateLegalJson(
    legalJson: any,
    issues: { errors: string[]; warnings: string[] }
  ) {
    const errors = issues.errors;
    if (legalJson === undefined) {
      errors.push(`Invalid 'legal' element`);
      return;
    }

    const year = legalJson.year;
    if (year === undefined) {
      errors.push(`The 'year' is required`);
    } else {
      const yearNumber = parseInt(year);
      if (yearNumber <= 1920) {
        errors.push(`The 'year' must be greater than 1920`);
      }
    }
    const owner = legalJson.owner;
    if (owner === undefined) {
      errors.push(`The 'owner' is required`);
    }
    const license = legalJson.license;
    if (license === undefined) {
      errors.push(`The 'license' is required`);
    }
    const artist = legalJson.artist;
    if (artist === undefined) {
      errors.push(`The 'artist' is required`);
    }
    const what = legalJson.what;
    if (what === undefined) {
      errors.push(`The 'what' is required`);
    }
  }

  /**
   * Validate the given metadata object, checking for the presence
   * of the screenshot and the validity of the legal information.
   *
   * @param modelPath - The path that contains the model, e.g.
   * "./Models/AnimatedTriangle".
   * @param metadata The metadata
   * @param issues Will be filled with any issues
   */
  private static validateMetadata(
    modelPath: string,
    metadata: Metadata,
    issues: { errors: string[]; warnings: string[] }
  ) {
    const errors = issues.errors;

    const screenshot = metadata.screenshot;
    const screenshotPath = `${modelPath}/${screenshot}`;
    if (!fs.existsSync(screenshotPath)) {
      errors.push(`Screenshot not found: ${screenshotPath}`);
    }

    const legal = metadata.legal;
    for (const element of legal) {
      Models.validateLegal(element, issues);
    }
  }

  /**
   * Validate the given legal object, checking for the consistency
   * of custom licenses and their required license file
   *
   * @param modelPath - The path that contains the model, e.g.
   * "./Models/AnimatedTriangle".
   * @param metadata The metadata
   * @param issues Will be filled with any issues
   */
  private static validateLegal(
    legal: Legal,
    issues: { errors: string[]; warnings: string[] }
  ) {
    const errors = issues.errors;
    const knownLicenses = Licenses.LICENSE;
    const license = legal.license;
    const knownLicense = knownLicenses[license];
    if (knownLicense === undefined) {
      if (legal.text === undefined) {
        errors.push(`License ${license} is not known - the 'text' is required`);
      }

      // Check for the presence of the license file
      const expectedLicenseFile = `./LICENSES/${license}.txt`;
      if (!fs.existsSync(expectedLicenseFile)) {
        errors.push(
          `License ${license} requires a file '${expectedLicenseFile}' to be present`
        );
      } else {
        // The actual license URL has to go up TWO levels,
        // because it refers to the model directory
        legal.licenseUrl = `../../LICENSES/${license}.txt`;
      }
    }
  }

  /**
   * Do some updates of legacy stuff...
   *
   * @param metadataJson - The metadata JSON
   */
  private static updateLegacyLicenseStructure(metadataJson: any) {
    const knownLicenses = Licenses.LICENSE;
    const legals = metadataJson.legal ?? [];

    const legacyLicenseNames: Record<string, string> = {
      CC0: "CC0-1.0",
      "CC-BY": "CC-BY-4.0",
      "CC-BY-NC": "CC-BY-NC-4.0",
      "LicenseRef-CC-BY-TM": "CC-BY-4.0",
      "CC-BY 4.0": "CC-BY-4.0",
      "CC-BY International 4.0": "CC-BY-4.0",
      "Public Domain / CC0": "CC0-1.0",
      "Creative Commons, Attribution-NonCommercial-ShareAlike 4.0 International":
        "CC-BY-NC-SA-4.0",
    };

    const customLicenses = [
      "LicenseRef-LegalMark-UX3D",
      "LicenseRef-LegalMark-Khronos",
      "LicenseRef-Poser-EULA",
      "LicenseRef-LegalMark-Cesium",
      "LicenseRef-LegalMark-DGG",
      "SCEA",
      "LicenseRef-Adobe-Stock",
      "LicenseRef-CRYENGINE-Agreement",
      "LicenseRef-3DRT-Testing",
      "LicenseRef-Stanford-Graphics",
    ];

    // Update the 'license' property to be the canonical SPDX
    // license identifier
    for (const legal of legals) {
      const license = legal.license;

      // Don't update the known custom licenses
      if (customLicenses.includes(license)) {
        //console.log(`License ${license} is a known custom license`);
        continue;
      }
      const knownLicense = knownLicenses[license];
      if (knownLicense === undefined) {
        //console.log(`License ${license} is not known`);

        // Check if there is a mapping from the license name to
        // the canonical one, and update it if this is the case
        const newLicenseName = legacyLicenseNames[license];
        if (newLicenseName === undefined) {
          console.log(
            `Warning: License ${license} is not known, and no new name found`
          );
        } else {
          const newKnownLicense = knownLicenses[newLicenseName];
          if (newKnownLicense === undefined) {
            console.log(
              `Warning: License ${license} is not known, and no valid new name found`
            );
          } else {
            if (ModelMetadata.verbose) {
              console.log(
                `License ${license} is not known, updating to ${newLicenseName}`
              );
            }
            legal.license = newLicenseName;
          }
        }
      }
    }

    // Update the fields of the legal to be canonical:
    for (const legal of legals) {
      const license = legal.license;
      const knownLicense = knownLicenses[license];
      if (knownLicense === undefined) {
        // Don't claim an 'spdx' identifier for licenses
        // that are not known
        legal.spdx = undefined;
      } else {
        // For known licenses, use the fields from the
        // known license definition
        legal.license = knownLicense.spdx;
        legal.licenseUrl = knownLicense.link;
        legal.text = knownLicense.text;
        legal.spdx = knownLicense.spdx;
        legal.icon = knownLicense.icon;
      }
    }
  }
}
