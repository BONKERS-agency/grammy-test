import type { MessageEntity } from "grammy/types";

/**
 * Parse mode types supported by Telegram.
 */
export type ParseMode = "Markdown" | "MarkdownV2" | "HTML";

/**
 * Result of parsing formatted text.
 */
export interface ParsedText {
  /** The plain text with formatting removed */
  text: string;
  /** The message entities representing formatting */
  entities: MessageEntity[];
}

/**
 * Parse Markdown/MarkdownV2/HTML text into plain text with entities.
 *
 * Supports:
 * - Bold: *text* (Markdown), *text* (MarkdownV2), <b>text</b> or <strong>text</strong> (HTML)
 * - Italic: _text_ (Markdown/MarkdownV2), <i>text</i> or <em>text</em> (HTML)
 * - Underline: __text__ (MarkdownV2), <u>text</u> or <ins>text</ins> (HTML)
 * - Strikethrough: ~text~ (MarkdownV2), <s>text</s>, <strike>text</strike>, or <del>text</del> (HTML)
 * - Spoiler: ||text|| (MarkdownV2), <tg-spoiler>text</tg-spoiler> or <span class="tg-spoiler">text</span> (HTML)
 * - Code: `text` (Markdown/MarkdownV2), <code>text</code> (HTML)
 * - Pre: ```text``` or ```language\ntext``` (Markdown/MarkdownV2), <pre>text</pre> (HTML)
 * - Links: [text](url) (Markdown/MarkdownV2), <a href="url">text</a> (HTML)
 * - Text mentions: [text](tg://user?id=123) (Markdown/MarkdownV2)
 * - Custom emoji: ![emoji](tg://emoji?id=123) (MarkdownV2)
 * - Blockquote: >text (MarkdownV2), <blockquote>text</blockquote> (HTML)
 */
export function parseFormattedText(text: string, parseMode: ParseMode): ParsedText {
  switch (parseMode) {
    case "Markdown":
      return parseMarkdown(text);
    case "MarkdownV2":
      return parseMarkdownV2(text);
    case "HTML":
      return parseHTML(text);
    default:
      return { text, entities: [] };
  }
}

/**
 * Parse legacy Markdown format.
 */
function parseMarkdown(input: string): ParsedText {
  const entities: MessageEntity[] = [];
  let result = "";
  let i = 0;

  while (i < input.length) {
    // Pre-formatted block: ```...```
    if (input.slice(i, i + 3) === "```") {
      const endIndex = input.indexOf("```", i + 3);
      if (endIndex !== -1) {
        let content = input.slice(i + 3, endIndex);
        let language: string | undefined;

        // Check for language specifier (first line)
        const newlineIndex = content.indexOf("\n");
        if (newlineIndex !== -1) {
          const potentialLang = content.slice(0, newlineIndex).trim();
          if (potentialLang && !potentialLang.includes(" ")) {
            language = potentialLang;
            content = content.slice(newlineIndex + 1);
          }
        }

        const entity: MessageEntity = {
          type: "pre",
          offset: result.length,
          length: content.length,
        };
        if (language) {
          (entity as MessageEntity.PreMessageEntity).language = language;
        }
        entities.push(entity);
        result += content;
        i = endIndex + 3;
        continue;
      }
    }

    // Inline code: `...`
    if (input[i] === "`") {
      const endIndex = input.indexOf("`", i + 1);
      if (endIndex !== -1) {
        const content = input.slice(i + 1, endIndex);
        entities.push({
          type: "code",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 1;
        continue;
      }
    }

    // Links: [text](url)
    if (input[i] === "[") {
      const closeBracket = input.indexOf("]", i + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === "(") {
        const closeParen = input.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = input.slice(i + 1, closeBracket);
          const url = input.slice(closeBracket + 2, closeParen);

          if (url.startsWith("tg://user?id=")) {
            const userId = parseInt(url.slice("tg://user?id=".length), 10);
            entities.push({
              type: "text_mention",
              offset: result.length,
              length: linkText.length,
              user: {
                id: userId,
                is_bot: false,
                first_name: linkText,
              },
            });
          } else {
            entities.push({
              type: "text_link",
              offset: result.length,
              length: linkText.length,
              url,
            });
          }
          result += linkText;
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Bold: *text*
    if (input[i] === "*") {
      const endIndex = input.indexOf("*", i + 1);
      if (endIndex !== -1) {
        const content = input.slice(i + 1, endIndex);
        entities.push({
          type: "bold",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 1;
        continue;
      }
    }

    // Italic: _text_
    if (input[i] === "_") {
      const endIndex = input.indexOf("_", i + 1);
      if (endIndex !== -1) {
        const content = input.slice(i + 1, endIndex);
        entities.push({
          type: "italic",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 1;
        continue;
      }
    }

    result += input[i];
    i++;
  }

  return { text: result, entities };
}

/**
 * Parse MarkdownV2 format with escaped characters.
 */
function parseMarkdownV2(input: string): ParsedText {
  const entities: MessageEntity[] = [];
  let result = "";
  let i = 0;

  // Characters that must be escaped in MarkdownV2
  const escapeChars = "_*[]()~`>#+-=|{}.!\\";

  while (i < input.length) {
    // Handle escaped characters
    if (input[i] === "\\" && i + 1 < input.length && escapeChars.includes(input[i + 1])) {
      result += input[i + 1];
      i += 2;
      continue;
    }

    // Blockquote: >text (only at start of line)
    if (input[i] === ">" && (i === 0 || input[i - 1] === "\n")) {
      let endIndex = input.indexOf("\n", i + 1);
      if (endIndex === -1) endIndex = input.length;
      const content = input.slice(i + 1, endIndex);
      entities.push({
        type: "blockquote",
        offset: result.length,
        length: content.length,
      });
      result += content;
      i = endIndex;
      continue;
    }

    // Pre-formatted block: ```...```
    if (input.slice(i, i + 3) === "```") {
      const endIndex = input.indexOf("```", i + 3);
      if (endIndex !== -1) {
        let content = input.slice(i + 3, endIndex);
        let language: string | undefined;

        const newlineIndex = content.indexOf("\n");
        if (newlineIndex !== -1) {
          const potentialLang = content.slice(0, newlineIndex).trim();
          if (potentialLang && !potentialLang.includes(" ")) {
            language = potentialLang;
            content = content.slice(newlineIndex + 1);
          }
        }

        const entity: MessageEntity = {
          type: "pre",
          offset: result.length,
          length: content.length,
        };
        if (language) {
          (entity as MessageEntity.PreMessageEntity).language = language;
        }
        entities.push(entity);
        result += content;
        i = endIndex + 3;
        continue;
      }
    }

    // Inline code: `...`
    if (input[i] === "`") {
      const endIndex = input.indexOf("`", i + 1);
      if (endIndex !== -1) {
        const content = input.slice(i + 1, endIndex);
        entities.push({
          type: "code",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 1;
        continue;
      }
    }

    // Spoiler: ||text||
    if (input.slice(i, i + 2) === "||") {
      const endIndex = input.indexOf("||", i + 2);
      if (endIndex !== -1) {
        const content = input.slice(i + 2, endIndex);
        entities.push({
          type: "spoiler",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 2;
        continue;
      }
    }

    // Underline: __text__
    if (input.slice(i, i + 2) === "__") {
      const endIndex = input.indexOf("__", i + 2);
      if (endIndex !== -1) {
        const content = input.slice(i + 2, endIndex);
        entities.push({
          type: "underline",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 2;
        continue;
      }
    }

    // Strikethrough: ~text~
    if (input[i] === "~") {
      const endIndex = input.indexOf("~", i + 1);
      if (endIndex !== -1) {
        const content = input.slice(i + 1, endIndex);
        entities.push({
          type: "strikethrough",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 1;
        continue;
      }
    }

    // Custom emoji: ![emoji](tg://emoji?id=123)
    if (input.slice(i, i + 2) === "![") {
      const closeBracket = input.indexOf("]", i + 2);
      if (closeBracket !== -1 && input[closeBracket + 1] === "(") {
        const closeParen = input.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const emojiAlt = input.slice(i + 2, closeBracket);
          const url = input.slice(closeBracket + 2, closeParen);

          if (url.startsWith("tg://emoji?id=")) {
            const emojiId = url.slice("tg://emoji?id=".length);
            entities.push({
              type: "custom_emoji",
              offset: result.length,
              length: emojiAlt.length,
              custom_emoji_id: emojiId,
            });
            result += emojiAlt;
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Links: [text](url)
    if (input[i] === "[") {
      const closeBracket = input.indexOf("]", i + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === "(") {
        const closeParen = input.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = input.slice(i + 1, closeBracket);
          const url = input.slice(closeBracket + 2, closeParen);

          if (url.startsWith("tg://user?id=")) {
            const userId = parseInt(url.slice("tg://user?id=".length), 10);
            entities.push({
              type: "text_mention",
              offset: result.length,
              length: linkText.length,
              user: {
                id: userId,
                is_bot: false,
                first_name: linkText,
              },
            });
          } else {
            entities.push({
              type: "text_link",
              offset: result.length,
              length: linkText.length,
              url,
            });
          }
          result += linkText;
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Bold: *text*
    if (input[i] === "*") {
      const endIndex = input.indexOf("*", i + 1);
      if (endIndex !== -1) {
        const content = input.slice(i + 1, endIndex);
        entities.push({
          type: "bold",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 1;
        continue;
      }
    }

    // Italic: _text_
    if (input[i] === "_") {
      const endIndex = input.indexOf("_", i + 1);
      if (endIndex !== -1) {
        const content = input.slice(i + 1, endIndex);
        entities.push({
          type: "italic",
          offset: result.length,
          length: content.length,
        });
        result += content;
        i = endIndex + 1;
        continue;
      }
    }

    result += input[i];
    i++;
  }

  return { text: result, entities };
}

/**
 * Parse HTML format.
 */
function parseHTML(input: string): ParsedText {
  const entities: MessageEntity[] = [];
  let result = "";
  let i = 0;

  // Map HTML tags to entity types
  const tagMap: Record<string, MessageEntity["type"]> = {
    b: "bold",
    strong: "bold",
    i: "italic",
    em: "italic",
    u: "underline",
    ins: "underline",
    s: "strikethrough",
    strike: "strikethrough",
    del: "strikethrough",
    code: "code",
    pre: "pre",
    "tg-spoiler": "spoiler",
    blockquote: "blockquote",
  };

  while (i < input.length) {
    if (input[i] === "<") {
      // Find tag end
      const tagEnd = input.indexOf(">", i);
      if (tagEnd === -1) {
        result += input[i];
        i++;
        continue;
      }

      const tagContent = input.slice(i + 1, tagEnd);

      // Check for closing tag
      if (tagContent.startsWith("/")) {
        i = tagEnd + 1;
        continue;
      }

      // Parse tag name and attributes
      const spaceIndex = tagContent.indexOf(" ");
      const tagName =
        spaceIndex === -1
          ? tagContent.toLowerCase()
          : tagContent.slice(0, spaceIndex).toLowerCase();

      // Handle <a> tags specially
      if (tagName === "a") {
        const hrefMatch = tagContent.match(/href=['"]([^'"]+)['"]/i);
        if (hrefMatch) {
          const url = hrefMatch[1];
          const closeTag = input.indexOf("</a>", tagEnd);
          if (closeTag !== -1) {
            const linkText = input.slice(tagEnd + 1, closeTag);

            if (url.startsWith("tg://user?id=")) {
              const userId = parseInt(url.slice("tg://user?id=".length), 10);
              entities.push({
                type: "text_mention",
                offset: result.length,
                length: linkText.length,
                user: {
                  id: userId,
                  is_bot: false,
                  first_name: linkText,
                },
              });
            } else {
              entities.push({
                type: "text_link",
                offset: result.length,
                length: linkText.length,
                url,
              });
            }
            result += linkText;
            i = closeTag + 4; // Skip </a>
            continue;
          }
        }
      }

      // Handle <span class="tg-spoiler">
      if (tagName === "span" && tagContent.includes('class="tg-spoiler"')) {
        const closeTag = input.indexOf("</span>", tagEnd);
        if (closeTag !== -1) {
          const content = input.slice(tagEnd + 1, closeTag);
          entities.push({
            type: "spoiler",
            offset: result.length,
            length: content.length,
          });
          result += content;
          i = closeTag + 7;
          continue;
        }
      }

      // Handle <pre> with language attribute
      if (tagName === "pre") {
        // Check for <code class="language-xxx"> inside
        const closeTag = input.indexOf("</pre>", tagEnd);
        if (closeTag !== -1) {
          let content = input.slice(tagEnd + 1, closeTag);
          let language: string | undefined;

          // Check for nested <code class="language-xxx">
          const codeMatch = content.match(/<code\s+class=['"]language-([^'"]+)['"]>/i);
          if (codeMatch) {
            language = codeMatch[1];
            content = content.replace(/<code[^>]*>/gi, "").replace(/<\/code>/gi, "");
          } else {
            content = content.replace(/<code>/gi, "").replace(/<\/code>/gi, "");
          }

          const entity: MessageEntity = {
            type: "pre",
            offset: result.length,
            length: content.length,
          };
          if (language) {
            (entity as MessageEntity.PreMessageEntity).language = language;
          }
          entities.push(entity);
          result += content;
          i = closeTag + 6;
          continue;
        }
      }

      // Handle <tg-emoji> custom emoji
      if (tagName === "tg-emoji") {
        const emojiIdMatch = tagContent.match(/emoji-id=['"]([^'"]+)['"]/i);
        if (emojiIdMatch) {
          const emojiId = emojiIdMatch[1];
          const closeTag = input.indexOf("</tg-emoji>", tagEnd);
          if (closeTag !== -1) {
            const emojiAlt = input.slice(tagEnd + 1, closeTag);
            entities.push({
              type: "custom_emoji",
              offset: result.length,
              length: emojiAlt.length,
              custom_emoji_id: emojiId,
            });
            result += emojiAlt;
            i = closeTag + 11;
            continue;
          }
        }
      }

      // Handle simple tags
      const entityType = tagMap[tagName];
      if (entityType) {
        const closeTag = input.indexOf(`</${tagName}>`, tagEnd);
        if (closeTag !== -1) {
          const content = input.slice(tagEnd + 1, closeTag);
          entities.push({
            type: entityType,
            offset: result.length,
            length: content.length,
          } as MessageEntity);
          result += content;
          i = closeTag + tagName.length + 3;
          continue;
        }
      }

      // Unknown tag, skip it
      i = tagEnd + 1;
      continue;
    }

    // Handle HTML entities
    if (input[i] === "&") {
      const semicolon = input.indexOf(";", i);
      if (semicolon !== -1 && semicolon - i < 10) {
        const entity = input.slice(i, semicolon + 1);
        const decoded = decodeHTMLEntity(entity);
        if (decoded !== entity) {
          result += decoded;
          i = semicolon + 1;
          continue;
        }
      }
    }

    result += input[i];
    i++;
  }

  return { text: result, entities };
}

/**
 * Decode common HTML entities.
 */
function decodeHTMLEntity(entity: string): string {
  const entities: Record<string, string> = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&nbsp;": " ",
  };
  return entities[entity] ?? entity;
}

/**
 * Format plain text with entities back to Markdown/MarkdownV2/HTML.
 * Useful for testing round-trip conversions.
 */
export function formatText(text: string, entities: MessageEntity[], format: ParseMode): string {
  if (entities.length === 0) return text;

  // Sort entities by offset (descending) to process from end to start
  const sorted = [...entities].sort((a, b) => b.offset - a.offset);
  let result = text;

  for (const entity of sorted) {
    const start = entity.offset;
    const end = entity.offset + entity.length;
    const content = result.slice(start, end);

    let formatted: string;

    switch (format) {
      case "Markdown":
        formatted = formatEntityMarkdown(entity, content);
        break;
      case "MarkdownV2":
        formatted = formatEntityMarkdownV2(entity, content);
        break;
      case "HTML":
        formatted = formatEntityHTML(entity, content);
        break;
      default:
        formatted = content;
    }

    result = result.slice(0, start) + formatted + result.slice(end);
  }

  return result;
}

function formatEntityMarkdown(entity: MessageEntity, content: string): string {
  switch (entity.type) {
    case "bold":
      return `*${content}*`;
    case "italic":
      return `_${content}_`;
    case "code":
      return `\`${content}\``;
    case "pre": {
      const lang = (entity as MessageEntity.PreMessageEntity).language;
      return lang ? `\`\`\`${lang}\n${content}\`\`\`` : `\`\`\`\n${content}\`\`\``;
    }
    case "text_link":
      return `[${content}](${(entity as MessageEntity.TextLinkMessageEntity).url})`;
    case "text_mention":
      return `[${content}](tg://user?id=${(entity as MessageEntity.TextMentionMessageEntity).user.id})`;
    default:
      return content;
  }
}

function formatEntityMarkdownV2(entity: MessageEntity, content: string): string {
  switch (entity.type) {
    case "bold":
      return `*${content}*`;
    case "italic":
      return `_${content}_`;
    case "underline":
      return `__${content}__`;
    case "strikethrough":
      return `~${content}~`;
    case "spoiler":
      return `||${content}||`;
    case "code":
      return `\`${content}\``;
    case "pre": {
      const lang = (entity as MessageEntity.PreMessageEntity).language;
      return lang ? `\`\`\`${lang}\n${content}\`\`\`` : `\`\`\`\n${content}\`\`\``;
    }
    case "text_link":
      return `[${content}](${(entity as MessageEntity.TextLinkMessageEntity).url})`;
    case "text_mention":
      return `[${content}](tg://user?id=${(entity as MessageEntity.TextMentionMessageEntity).user.id})`;
    case "custom_emoji":
      return `![${content}](tg://emoji?id=${(entity as MessageEntity.CustomEmojiMessageEntity).custom_emoji_id})`;
    case "blockquote":
      return `>${content}`;
    default:
      return content;
  }
}

function formatEntityHTML(entity: MessageEntity, content: string): string {
  switch (entity.type) {
    case "bold":
      return `<b>${content}</b>`;
    case "italic":
      return `<i>${content}</i>`;
    case "underline":
      return `<u>${content}</u>`;
    case "strikethrough":
      return `<s>${content}</s>`;
    case "spoiler":
      return `<tg-spoiler>${content}</tg-spoiler>`;
    case "code":
      return `<code>${content}</code>`;
    case "pre": {
      const lang = (entity as MessageEntity.PreMessageEntity).language;
      return lang
        ? `<pre><code class="language-${lang}">${content}</code></pre>`
        : `<pre>${content}</pre>`;
    }
    case "text_link":
      return `<a href="${(entity as MessageEntity.TextLinkMessageEntity).url}">${content}</a>`;
    case "text_mention":
      return `<a href="tg://user?id=${(entity as MessageEntity.TextMentionMessageEntity).user.id}">${content}</a>`;
    case "custom_emoji":
      return `<tg-emoji emoji-id="${(entity as MessageEntity.CustomEmojiMessageEntity).custom_emoji_id}">${content}</tg-emoji>`;
    case "blockquote":
      return `<blockquote>${content}</blockquote>`;
    default:
      return content;
  }
}
