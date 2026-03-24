import { Cookie } from "elysia";
import AdmZip from "adm-zip";
import { unlink, rename, stat } from "node:fs/promises";
import path from "node:path";
import sanitize from "sanitize-filename";
import db from "../db/db";
import { MAX_CONVERT_PROCESS } from "../helpers/env";
import { normalizeFiletype, normalizeOutputFiletype } from "../helpers/normalizeFiletype";
import { convert as convertassimp, properties as propertiesassimp } from "./assimp";
import { convert as convertCalibre, properties as propertiesCalibre } from "./calibre";
import { convert as convertDasel, properties as propertiesDasel } from "./dasel";
import { convert as convertDvisvgm, properties as propertiesDvisvgm } from "./dvisvgm";
import { convert as convertFFmpeg, properties as propertiesFFmpeg } from "./ffmpeg";
import {
  convert as convertGraphicsmagick,
  properties as propertiesGraphicsmagick,
} from "./graphicsmagick";
import { convert as convertImagemagick, properties as propertiesImagemagick } from "./imagemagick";
import { convert as convertInkscape, properties as propertiesInkscape } from "./inkscape";
import { convert as convertLibheif, properties as propertiesLibheif } from "./libheif";
import { convert as convertLibjxl, properties as propertiesLibjxl } from "./libjxl";
import { convert as convertLibreOffice, properties as propertiesLibreOffice } from "./libreoffice";
import { convert as convertMsgconvert, properties as propertiesMsgconvert } from "./msgconvert";
import { convert as convertPandoc, properties as propertiesPandoc } from "./pandoc";
import { convert as convertPotrace, properties as propertiesPotrace } from "./potrace";
import { convert as convertresvg, properties as propertiesresvg } from "./resvg";
import { convert as convertImage, properties as propertiesImage } from "./vips";
import { convert as convertVtracer, properties as propertiesVtracer } from "./vtracer";
import { convert as convertVcf, properties as propertiesVcf } from "./vcf";
import { convert as convertxelatex, properties as propertiesxelatex } from "./xelatex";
import { convert as convertMarkitdown, properties as propertiesMarkitdown } from "./markitdown";

// This should probably be reconstructed so that the functions are not imported instead the functions hook into this to make the converters more modular

const properties: Record<
  string,
  {
    properties: {
      from: Record<string, string[]>;
      to: Record<string, string[]>;
      options?: Record<
        string,
        Record<
          string,
          {
            description: string;
            type: string;
            default: number;
          }
        >
      >;
    };
    converter: (
      filePath: string,
      fileType: string,
      convertTo: string,
      targetPath: string,

      options?: unknown,
    ) => unknown;
  }
> = {
  // Prioritize Inkscape for EMF files as it handles them better than ImageMagick
  inkscape: {
    properties: propertiesInkscape,
    converter: convertInkscape,
  },
  libjxl: {
    properties: propertiesLibjxl,
    converter: convertLibjxl,
  },
  resvg: {
    properties: propertiesresvg,
    converter: convertresvg,
  },
  vips: {
    properties: propertiesImage,
    converter: convertImage,
  },
  libheif: {
    properties: propertiesLibheif,
    converter: convertLibheif,
  },
  xelatex: {
    properties: propertiesxelatex,
    converter: convertxelatex,
  },
  calibre: {
    properties: propertiesCalibre,
    converter: convertCalibre,
  },
  dasel: {
    properties: propertiesDasel,
    converter: convertDasel,
  },
  libreoffice: {
    properties: propertiesLibreOffice,
    converter: convertLibreOffice,
  },
  pandoc: {
    properties: propertiesPandoc,
    converter: convertPandoc,
  },
  msgconvert: {
    properties: propertiesMsgconvert,
    converter: convertMsgconvert,
  },
  dvisvgm: {
    properties: propertiesDvisvgm,
    converter: convertDvisvgm,
  },
  imagemagick: {
    properties: propertiesImagemagick,
    converter: convertImagemagick,
  },
  graphicsmagick: {
    properties: propertiesGraphicsmagick,
    converter: convertGraphicsmagick,
  },
  assimp: {
    properties: propertiesassimp,
    converter: convertassimp,
  },
  ffmpeg: {
    properties: propertiesFFmpeg,
    converter: convertFFmpeg,
  },
  potrace: {
    properties: propertiesPotrace,
    converter: convertPotrace,
  },
  vtracer: {
    properties: propertiesVtracer,
    converter: convertVtracer,
  },
  vcf: {
    properties: propertiesVcf,
    converter: convertVcf,
  },
  markitDown: {
    properties: propertiesMarkitdown,
    converter: convertMarkitdown,
  },
};

function chunks<T>(arr: T[], size: number): T[][] {
  if (size <= 0) {
    return [arr];
  }
  return Array.from({ length: Math.ceil(arr.length / size) }, (_: T, i: number) =>
    arr.slice(i * size, i * size + size),
  );
}

async function handleMultiFrameOutput(
  targetPath: string,
  newFileName: string,
  userOutputDir: string,
): Promise<string> {
  const targetFile = Bun.file(targetPath);
  const exists = await targetFile.exists();

  if (exists) {
    // Target file exists as expected, return unchanged
    return newFileName;
  }

  // Target file doesn't exist, multi-frame detection will be needed
  console.log(`Multi-frame detection needed for: ${newFileName}`);
  console.log(`Expected file not found: ${targetPath}`);

  // Extract base filename and extension
  const lastDotIndex = newFileName.lastIndexOf(".");
  const baseFileName = lastDotIndex > 0 ? newFileName.substring(0, lastDotIndex) : newFileName;
  const extension = lastDotIndex > 0 ? newFileName.substring(lastDotIndex + 1) : "";

  // Sanitize: strip path separators then apply sanitize-filename to prevent path traversal
  const safeBaseFileName = sanitize(baseFileName.replace(/[/\\]/g, ""));

  console.log(`Base filename: ${safeBaseFileName}, Extension: ${extension}`);

  // Escape glob metacharacters in baseFileName to prevent pattern injection
  const escapedBaseFileName = safeBaseFileName.replace(/[*?[\]{}!\\]/g, "\\$&");

  // Search for frame files matching pattern: baseFileName-*.extension
  const framePattern = `${escapedBaseFileName}-*.${extension}`;
  const glob = new Bun.Glob(framePattern);
  const frameFiles: string[] = [];

  // Scan the output directory for matching files
  for await (const file of glob.scan({ cwd: userOutputDir, onlyFiles: true })) {
    frameFiles.push(file);
  }

  console.log(`Detected ${frameFiles.length} frame file(s):`);
  for (const frameFile of frameFiles) {
    console.log(`  - ${frameFile}`);
  }

  // Handle based on number of frame files detected
  if (frameFiles.length === 0) {
    throw new Error(`No output files generated for ${newFileName}`);
  }

  if (frameFiles.length === 1) {
    // Single frame: rename to expected target path
    const frame = frameFiles[0]!;
    const singleFramePath = path.join(userOutputDir, frame);
    console.log(`Renaming single frame: ${frameFiles[0]} -> ${newFileName}`);
    await rename(singleFramePath, targetPath);
    return newFileName;
  }

  // Multiple frames: create a zip archive
  console.log(`Creating zip archive for ${frameFiles.length} frames`);
  const zipFileName = `${safeBaseFileName}.zip`;
  const zipPath = path.join(userOutputDir, zipFileName);

  // Verify the resolved zip path is inside userOutputDir to prevent path traversal
  const resolvedZipPath = path.resolve(zipPath);
  const resolvedOutputDir = path.resolve(userOutputDir);
  if (!resolvedZipPath.startsWith(resolvedOutputDir + path.sep)) {
    throw new Error(`Path traversal detected: zip path escapes output directory`);
  }

  // Memory safeguard: reject before loading anything if total frame size exceeds 200 MB
  const MAX_ZIP_BYTES = 200 * 1024 * 1024;
  let totalFrameSize = 0;
  for (const frameFile of frameFiles) {
    const { size } = await stat(path.join(userOutputDir, frameFile));
    totalFrameSize += size;
  }
  if (totalFrameSize > MAX_ZIP_BYTES) {
    throw new Error(
      `Total frame size (${Math.round(totalFrameSize / 1024 / 1024)} MB) exceeds the 200 MB zip memory limit`,
    );
  }

  const zip = new AdmZip();

  // Add all frame files to the zip
  for (const frameFile of frameFiles) {
    const frameFilePath = path.join(userOutputDir, frameFile);
    console.log(`Adding to zip: ${frameFile}`);
    zip.addLocalFile(frameFilePath);
  }

  try {
    // Write synchronously — no callback, no hanging Promise
    zip.writeZip(zipPath);

    console.log(`Zip created successfully: ${zipFileName}`);

    // Delete individual frame files only after zip is confirmed written
    for (const frameFile of frameFiles) {
      const frameFilePath = path.join(userOutputDir, frameFile);
      try {
        await unlink(frameFilePath);
        console.log(`Deleted frame file: ${frameFile}`);
      } catch (err) {
        console.error(`Failed to delete frame file ${frameFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    // Clean up any partial zip, but leave frame files intact
    const partialExists = await Bun.file(zipPath).exists();
    if (partialExists) {
      await unlink(zipPath).catch(() => {});
    }
    throw new Error(
      `Failed to create zip for ${safeBaseFileName}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return zipFileName;
}

export async function handleConvert(
  fileNames: string[],
  userUploadsDir: string,
  userOutputDir: string,
  convertTo: string,
  converterName: string,
  jobId: Cookie<string | undefined>,
) {
  const query = db.query(
    "INSERT INTO file_names (job_id, file_name, output_file_name, status) VALUES (?1, ?2, ?3, ?4)",
  );

  for (const chunk of chunks(fileNames, MAX_CONVERT_PROCESS)) {
    const toProcess: Promise<string>[] = [];
    for (const fileName of chunk) {
      const filePath = `${userUploadsDir}${fileName}`;
      const fileTypeOrig = fileName.split(".").pop() ?? "";
      const fileType = normalizeFiletype(fileTypeOrig);
      const newFileExt = normalizeOutputFiletype(convertTo);
      const newFileName = fileName.replace(
        new RegExp(`${fileTypeOrig}(?!.*${fileTypeOrig})`),
        newFileExt,
      );
      const targetPath = `${userOutputDir}${newFileName}`;
      toProcess.push(
        new Promise((resolve, reject) => {
          mainConverter(filePath, fileType, convertTo, targetPath, {}, converterName)
            .then(async (r) => {
              const finalFileName = await handleMultiFrameOutput(targetPath, newFileName, userOutputDir);
              if (jobId.value) {
                query.run(jobId.value, fileName, finalFileName, r);
              }
              resolve(r);
            })
            .catch((c) => reject(c));
        }),
      );
    }
    await Promise.all(toProcess);
  }
}

async function mainConverter(
  inputFilePath: string,
  fileTypeOriginal: string,
  convertTo: string,
  targetPath: string,
  options?: unknown,
  converterName?: string,
) {
  const fileType = normalizeFiletype(fileTypeOriginal);

  let converterFunc: (typeof properties)["libjxl"]["converter"] | undefined;

  if (converterName) {
    converterFunc = properties[converterName]?.converter;
  } else {
    // Iterate over each converter in properties
    for (converterName in properties) {
      const converterObj = properties[converterName];

      if (!converterObj) {
        break;
      }

      for (const key in converterObj.properties.from) {
        if (
          converterObj?.properties?.from[key]?.includes(fileType) &&
          converterObj?.properties?.to[key]?.includes(convertTo)
        ) {
          converterFunc = converterObj.converter;
          break;
        }
      }
    }
  }

  if (!converterFunc) {
    console.log(`No available converter supports converting from ${fileType} to ${convertTo}.`);
    return "File type not supported";
  }

  try {
    const result = await converterFunc(inputFilePath, fileType, convertTo, targetPath, options);

    console.log(
      `Converted ${inputFilePath} from ${fileType} to ${convertTo} successfully using ${converterName}.`,
      result,
    );

    if (typeof result === "string") {
      return result;
    }

    return "Done";
  } catch (error) {
    console.error(
      `Failed to convert ${inputFilePath} from ${fileType} to ${convertTo} using ${converterName}.`,
      error,
    );
    return "Failed, check logs";
  }
}

const possibleTargets: Record<string, Record<string, string[]>> = {};

for (const converterName in properties) {
  const converterProperties = properties[converterName]?.properties;
  if (!converterProperties) continue;

  for (const key in converterProperties.from) {
    const fromList = converterProperties.from[key];
    const toList = converterProperties.to[key];

    if (!fromList || !toList) continue;

    for (const ext of fromList) {
      if (!possibleTargets[ext]) possibleTargets[ext] = {};

      possibleTargets[ext][converterName] = toList;
    }
  }
}

export const getPossibleTargets = (from: string): Record<string, string[]> => {
  const fromClean = normalizeFiletype(from);

  return possibleTargets[fromClean] || {};
};

const possibleInputs: string[] = [];
for (const converterName in properties) {
  const converterProperties = properties[converterName]?.properties;

  if (!converterProperties) {
    continue;
  }

  for (const key in converterProperties.from) {
    for (const extension of converterProperties.from[key] ?? []) {
      if (!possibleInputs.includes(extension)) {
        possibleInputs.push(extension);
      }
    }
  }
}
possibleInputs.sort();

const allTargets: Record<string, string[]> = {};

for (const converterName in properties) {
  const converterProperties = properties[converterName]?.properties;

  if (!converterProperties) {
    continue;
  }

  for (const key in converterProperties.to) {
    if (allTargets[converterName]) {
      allTargets[converterName].push(...(converterProperties.to[key] || []));
    } else {
      allTargets[converterName] = converterProperties.to[key] || [];
    }
  }
}

export const getAllTargets = () => {
  return allTargets;
};

const allInputs: Record<string, string[]> = {};
for (const converterName in properties) {
  const converterProperties = properties[converterName]?.properties;

  if (!converterProperties) {
    continue;
  }

  for (const key in converterProperties.from) {
    if (allInputs[converterName]) {
      allInputs[converterName].push(...(converterProperties.from[key] || []));
    } else {
      allInputs[converterName] = converterProperties.from[key] || [];
    }
  }
}

export const getAllInputs = (converter: string) => {
  return allInputs[converter] || [];
};
