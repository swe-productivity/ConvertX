import { execFile as execFileOriginal } from "node:child_process";
import { ExecFileFn } from "./types";

export const properties = {
  from: {
    text: [
      "602",
      "abw",
      "csv",
      "cwk",
      "doc",
      "docm",
      "docx",
      "dot",
      "dotx",
      "dotm",
      "epub",
      "fb2",
      "fodt",
      "htm",
      "html",
      "hwp",
      "mcw",
      "mw",
      "mwd",
      "lwp",
      "lrf",
      "odt",
      "ott",
      "pages",
      "pdf",
      "psw",
      "rtf",
      "sdw",
      "stw",
      "sxw",
      "tab",
      "tsv",
      "txt",
      "wn",
      "wpd",
      "wps",
      "wpt",
      "wri",
      "xhtml",
      "xml",
      "zabw",
    ],
    impress: [
      "ppt",
      "pptx",
      "pps",
      "ppsx",
      "pptm",
      "pot",
      "potx",
      "potm",
      "odp",
      "otp",
      "fodp",
      "sxi",
    ],
  },
  to: {
    text: [
      "csv",
      "doc",
      "docm",
      "docx",
      "dot",
      "dotx",
      "dotm",
      "epub",
      "fodt",
      "htm",
      "html",
      "odt",
      "ott",
      "pdf",
      "rtf",
      "tab",
      "tsv",
      "txt",
      "wps",
      "wpt",
      "xhtml",
      "xml",
    ],
    impress: [
      "pdf",
      "ppt",
      "pptx",
      "odp",
      "otp",
      "fodp",
      "html",
    ],
  },
};

type FileCategories = "text" | "calc" | "impress";

const filters: Record<FileCategories, Record<string, string>> = {
  text: {
    "602": "T602Document",
    abw: "AbiWord",
    csv: "Text",
    doc: "MS Word 97",
    docm: "MS Word 2007 XML VBA",
    docx: "MS Word 2007 XML",
    dot: "MS Word 97 Vorlage",
    dotx: "MS Word 2007 XML Template",
    dotm: "MS Word 2007 XML Template",
    epub: "EPUB",
    fb2: "Fictionbook 2",
    fodt: "OpenDocument Text Flat XML",
    htm: "HTML (StarWriter)",
    html: "HTML (StarWriter)",
    hwp: "writer_MIZI_Hwp_97",
    mcw: "MacWrite",
    mw: "MacWrite",
    mwd: "Mariner_Write",
    lwp: "LotusWordPro",
    lrf: "BroadBand eBook",
    odt: "writer8",
    ott: "writer8_template",
    pages: "Apple Pages",
    // pdf: "writer_pdf_import",
    psw: "PocketWord File",
    rtf: "Rich Text Format",
    sdw: "StarOffice_Writer",
    stw: "writer_StarOffice_XML_Writer_Template",
    sxw: "StarOffice XML (Writer)",
    tab: "Text",
    tsv: "Text",
    txt: "Text",
    wn: "WriteNow",
    wpd: "WordPerfect",
    wps: "MS Word 97",
    wpt: "MS Word 97 Vorlage",
    wri: "MS_Write",
    xhtml: "HTML (StarWriter)",
    xml: "OpenDocument Text Flat XML",
    zabw: "AbiWord",
  },
  calc: {},
  impress: {
    ppt: "MS PowerPoint 97",
    pptx: "Impress MS PowerPoint 2007 XML",
    pps: "MS PowerPoint 97",
    ppsx: "Impress MS PowerPoint 2007 XML",
    pptm: "Impress MS PowerPoint 2007 XML VBA",
    pot: "MS PowerPoint 97 Vorlage",
    potx: "Impress MS PowerPoint 2007 XML Template",
    potm: "Impress MS PowerPoint 2007 XML Template",
    odp: "impress8",
    otp: "impress8_template",
    fodp: "OpenDocument Presentation Flat XML",
    sxi: "StarOffice XML (Impress)",
    pdf: "impress_pdf_Export",
    html: "impress_html_Export",
  },
};

const getFilters = (fileType: string, converto: string) => {
  if (fileType in filters.text && converto in filters.text) {
    return [filters.text[fileType], filters.text[converto]];
  } else if (fileType in filters.calc && converto in filters.calc) {
    return [filters.calc[fileType], filters.calc[converto]];
  } else if (fileType in filters.impress && converto in filters.impress) {
    return [filters.impress[fileType], filters.impress[converto]];
  }
  return [null, null];
};

export function convert(
  filePath: string,
  fileType: string,
  convertTo: string,
  targetPath: string,
  options?: unknown,
  execFile: ExecFileFn = execFileOriginal,
): Promise<string> {
  const outputPath = targetPath.split("/").slice(0, -1).join("/").replace("./", "") ?? targetPath;

  // Build arguments array
  const args: string[] = [];
  args.push("--headless");
  args.push("--invisible");
  const [inFilter, outFilter] = getFilters(fileType, convertTo);

  if (inFilter) {
    args.push(`--infilter="${inFilter}"`);
  }

  if (outFilter) {
    args.push("--convert-to", `${convertTo}:${outFilter}`, "--outdir", outputPath, filePath);
  } else {
    args.push("--convert-to", convertTo, "--outdir", outputPath, filePath);
  }

  return new Promise((resolve, reject) => {
    execFile("soffice", args, (error, stdout, stderr) => {
      if (error) {
        reject(`error: ${error}`);
      }

      if (stdout) {
        console.log(`stdout: ${stdout}`);
      }

      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }

      resolve("Done");
    });
  });
}
