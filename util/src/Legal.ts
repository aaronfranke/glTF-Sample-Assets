/**
 * Plain type definition for what is found in the 'legal' array
 * property of the 'metadata.json'.
 *
 * The properties that are REQUIRED in the input are
 * - "license"
 * - "year"
 * - "owner"
 * - "artist"
 * - "what"
 *
 * When the 'license' is a known SPDX identifier, as defined in the
 * 'Licenses.LICENSES', then the optional fields will be filled
 * with the information from these licenses.
 *
 * Otherwise, the 'license' must be a custom license name, like
 * "LicenseRef-LegalMark-Khronos". In this case, the 'text' and
 * the 'licenseUrl' are required. The 'licenseUrl' should then
 * point to the respective license file in the repository.
 */
export type Legal = {
  license: string;
  licenseUrl: string | undefined;
  year: string;
  owner: string;
  artist: string;
  what: string;
  text: string | undefined;
  spdx: string | undefined;
  icon: string | undefined;
};
