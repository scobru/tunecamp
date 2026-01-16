import Handlebars from "handlebars";
import { readFile } from "../utils/fileUtils.js";
import { formatDuration, getAudioFormat } from "../utils/audioUtils.js";
import path from "path";

/**
 * Handlebars template engine with helpers
 */
export class TemplateEngine {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    // Format duration helper
    Handlebars.registerHelper("formatDuration", (seconds?: number) => {
      return formatDuration(seconds);
    });

    // Format audio format helper
    Handlebars.registerHelper("formatAudioFormat", (filename: string) => {
      return getAudioFormat(filename);
    });

    // Format date helper
    Handlebars.registerHelper("formatDate", (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    });

    // Conditional helper
    Handlebars.registerHelper("eq", (a: any, b: any) => {
      return a === b;
    });

    // Array join helper
    Handlebars.registerHelper("join", (array: any[], separator: string) => {
      return array ? array.join(separator) : "";
    });

    // String startsWith helper
    Handlebars.registerHelper("startsWith", (str: string, prefix: string) => {
      return str && typeof str === 'string' && str.startsWith(prefix);
    });

    // Logical OR helper
    Handlebars.registerHelper("or", (a: any, b: any) => {
      return a || b;
    });

    // Path helper - prepends basePath to URLs
    Handlebars.registerHelper("path", function(this: any, url: string) {
      const basePath = this.basePath || "";
      
      // If url is already relative (starts with ./ or ../), return as-is
      if (url.startsWith("./") || url.startsWith("../")) {
        return url;
      }
      
      // If url is already absolute (starts with /), apply basePath
      if (url.startsWith("/")) {
        if (!basePath || basePath === "/") {
          return url;
        }
        const cleanBasePath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
        return cleanBasePath + url;
      }
      
      // For relative URLs without ./ prefix, make them relative to current directory
      if (!url.startsWith("/")) {
        return "./" + url;
      }
      
      return url;
    });

    // Release path helper - for release pages, handles relative paths correctly
    Handlebars.registerHelper("releasePath", function(this: any, url: string) {
      // For release pages, always use relative paths
      if (url.startsWith("/")) {
        // Convert absolute path to relative
        return "." + url;
      }
      // Ensure relative paths start with ./ for same-directory files
      // URL encode the path to handle spaces and special characters
      if (!url.startsWith("./") && !url.startsWith("../") && !url.startsWith("http://") && !url.startsWith("https://")) {
        const parts = url.split('/');
        const encodedParts = parts.map(part => {
          // Encode each part separately to preserve slashes
          return encodeURIComponent(part);
        });
        return "./" + encodedParts.join('/');
      }
      // If already has ./ or ../, encode the filename parts
      if (url.includes('/')) {
        const parts = url.split('/');
        const lastPart = parts[parts.length - 1];
        const encodedLast = encodeURIComponent(lastPart);
        parts[parts.length - 1] = encodedLast;
        return parts.join('/');
      }
      // Single filename - encode it
      return encodeURIComponent(url);
    });

    // Asset path helper - for CSS, JS, and other assets
    Handlebars.registerHelper("assetPath", function(this: any, url: string) {
      const basePath = this.basePath || "";
      
      // If url is already relative (starts with ./ or ../), return as-is
      if (url.startsWith("./") || url.startsWith("../")) {
        return url;
      }
      
      // Check if we're in a release page (has backUrl context)
      const isReleasePage = this.backUrl !== undefined;
      
      if (isReleasePage) {
        // For release pages, we need to go up to the root to access assets
        if (url.startsWith("/")) {
          if (!basePath || basePath === "/") {
            return "../../" + url.substring(1);
          }
          const cleanBasePath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
          return "../../" + cleanBasePath + url;
        }
        
        // For relative URLs without ./ prefix in release pages
        if (!url.startsWith("/")) {
          return "../../" + url;
        }
      } else {
        // For main pages, use normal path helper logic
        if (url.startsWith("/")) {
          if (!basePath || basePath === "/") {
            return url;
          }
          const cleanBasePath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
          return cleanBasePath + url;
        }
        
        // For relative URLs without ./ prefix in main pages
        if (!url.startsWith("/")) {
          return "./" + url;
        }
      }
      
      return url;
    });
  }

  async loadTemplate(templatePath: string, name: string): Promise<void> {
    const content = await readFile(templatePath);
    const template = Handlebars.compile(content);
    this.templates.set(name, template);
  }

  render(templateName: string, data: any): string {
    const template = this.templates.get(templateName);

    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    return template(data);
  }

  renderWithLayout(
    templateName: string,
    data: any,
    pageTitle?: string
  ): string {
    // First render the content template
    const content = this.render(templateName, data);

    // Then wrap it in the layout
    if (this.hasTemplate("layout")) {
      return this.render("layout", {
        ...data,
        content,
        pageTitle,
      });
    }

    // If no layout, return content as-is
    return content;
  }

  hasTemplate(templateName: string): boolean {
    return this.templates.has(templateName);
  }
}
