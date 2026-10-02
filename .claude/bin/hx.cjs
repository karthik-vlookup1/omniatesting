#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports2) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports2.Argument = Argument2;
    exports2.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports2) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent)) return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n") return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports2.Help = Help2;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports2.Option = Option2;
    exports2.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports2) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports2.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports2) {
    var EventEmitter = require("node:events").EventEmitter;
    var childProcess = require("node:child_process");
    var path47 = require("node:path");
    var fs50 = require("node:fs");
    var process2 = require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str, write) => write(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path47.resolve(baseDir, baseName);
          if (fs50.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path47.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs50.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs50.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path47.resolve(
            path47.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path47.basename(
              this._scriptPath,
              path47.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path47.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path47.basename(filename, path47.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path48) {
        if (path48 === void 0) return this._executableDir;
        this._executableDir = path48;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports2.Command = Command2;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports2) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports2.program = new Command2();
    exports2.createCommand = (name) => new Command2(name);
    exports2.createOption = (flags, description) => new Option2(flags, description);
    exports2.createArgument = (name, description) => new Argument2(name, description);
    exports2.Command = Command2;
    exports2.Option = Option2;
    exports2.Argument = Argument2;
    exports2.Help = Help2;
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
    exports2.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "node_modules/picomatch/lib/constants.js"(exports2, module2) {
    "use strict";
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DEFAULT_MAX_EXTGLOB_RECURSION = 0;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var SEP = "/";
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR,
      SEP
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
      SEP: "\\"
    };
    var POSIX_REGEX_SOURCE = {
      __proto__: null,
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module2.exports = {
      DEFAULT_MAX_EXTGLOB_RECURSION,
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        __proto__: null,
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// node_modules/picomatch/lib/utils.js
var require_utils = __commonJS({
  "node_modules/picomatch/lib/utils.js"(exports2) {
    "use strict";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants();
    exports2.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports2.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports2.isRegexChar = (str) => str.length === 1 && exports2.hasRegexChars(str);
    exports2.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports2.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports2.isWindows = () => {
      if (typeof navigator !== "undefined" && navigator.platform) {
        const platform = navigator.platform.toLowerCase();
        return platform === "win32" || platform === "windows";
      }
      if (typeof process !== "undefined" && process.platform) {
        return process.platform === "win32";
      }
      return false;
    };
    exports2.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports2.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports2.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports2.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports2.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
    exports2.basename = (path47, { windows } = {}) => {
      const segs = path47.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") {
        return segs[segs.length - 2];
      }
      return last;
    };
  }
});

// node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "node_modules/picomatch/lib/scan.js"(exports2, module2) {
    "use strict";
    var utils = require_utils();
    var {
      CHAR_ASTERISK,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET
      /* ] */
    } = require_constants();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.tokens === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              let parens = 0;
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  advance();
                  continue;
                }
                if (code === CHAR_LEFT_PARENTHESES) {
                  parens++;
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            let parens = 1;
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_BACKWARD_SLASH) {
                backslashes = token.backslashes = true;
                advance();
                continue;
              }
              if (code === CHAR_LEFT_PARENTHESES) {
                parens++;
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else {
        base = str;
      }
      if (base && base !== "" && base !== "/" && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n2 = prevIndex !== void 0 ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value2 = input.slice(n2, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value2;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (i >= start) {
            parts.push(value2);
            prevIndex = i;
          }
        }
        const n = prevIndex !== void 0 ? prevIndex + 1 : start;
        const value = input.slice(n);
        parts.push(value);
        if (opts.tokens && prevIndex && prevIndex + 1 < input.length) {
          tokens[tokens.length - 1].value = value;
          depth(tokens[tokens.length - 1]);
          state.maxDepth += tokens[tokens.length - 1].depth;
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module2.exports = scan;
  }
});

// node_modules/picomatch/lib/parse.js
var require_parse = __commonJS({
  "node_modules/picomatch/lib/parse.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var utils = require_utils();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var splitTopLevel = (input) => {
      const parts = [];
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let value = "";
      let escaped = false;
      for (const ch of input) {
        if (escaped === true) {
          value += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          value += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          value += ch;
          continue;
        }
        if (quote === 0) {
          if (ch === "[") {
            bracket++;
          } else if (ch === "]" && bracket > 0) {
            bracket--;
          } else if (bracket === 0) {
            if (ch === "(") {
              paren++;
            } else if (ch === ")" && paren > 0) {
              paren--;
            } else if (ch === "|" && paren === 0) {
              parts.push(value);
              value = "";
              continue;
            }
          }
        }
        value += ch;
      }
      parts.push(value);
      return parts;
    };
    var isPlainBranch = (branch) => {
      let escaped = false;
      for (const ch of branch) {
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (/[?*+@!()[\]{}]/.test(ch)) {
          return false;
        }
      }
      return true;
    };
    var normalizeSimpleBranch = (branch) => {
      let value = branch.trim();
      let changed = true;
      while (changed === true) {
        changed = false;
        if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
          value = value.slice(2, -1);
          changed = true;
        }
      }
      if (!isPlainBranch(value)) {
        return;
      }
      return value.replace(/\\(.)/g, "$1");
    };
    var hasRepeatedCharPrefixOverlap = (branches) => {
      const values = branches.map(normalizeSimpleBranch).filter(Boolean);
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const a = values[i];
          const b = values[j];
          const char = a[0];
          if (!char || a !== char.repeat(a.length) || b !== char.repeat(b.length)) {
            continue;
          }
          if (a === b || a.startsWith(b) || b.startsWith(a)) {
            return true;
          }
        }
      }
      return false;
    };
    var parseRepeatedExtglob = (pattern, requireEnd = true) => {
      if (pattern[0] !== "+" && pattern[0] !== "*" || pattern[1] !== "(") {
        return;
      }
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let escaped = false;
      for (let i = 1; i < pattern.length; i++) {
        const ch = pattern[i];
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          continue;
        }
        if (quote === 1) {
          continue;
        }
        if (ch === "[") {
          bracket++;
          continue;
        }
        if (ch === "]" && bracket > 0) {
          bracket--;
          continue;
        }
        if (bracket > 0) {
          continue;
        }
        if (ch === "(") {
          paren++;
          continue;
        }
        if (ch === ")") {
          paren--;
          if (paren === 0) {
            if (requireEnd === true && i !== pattern.length - 1) {
              return;
            }
            return {
              type: pattern[0],
              body: pattern.slice(2, i),
              end: i
            };
          }
        }
      }
    };
    var buildCharClassStar = (chars) => {
      const source = chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch) => utils.escapeRegex(ch)).join("")}]`;
      return `${source}*`;
    };
    var getStarExtglobSequenceChars = (pattern) => {
      let index = 0;
      const chars = [];
      while (index < pattern.length) {
        const match = parseRepeatedExtglob(pattern.slice(index), false);
        if (!match || match.type !== "*") {
          return;
        }
        const branches = splitTopLevel(match.body).map((branch2) => branch2.trim());
        if (branches.length !== 1) {
          return;
        }
        const branch = normalizeSimpleBranch(branches[0]);
        if (!branch || branch.length !== 1) {
          return;
        }
        chars.push(branch);
        index += match.end + 1;
      }
      if (chars.length < 1) {
        return;
      }
      return chars;
    };
    var repeatedExtglobRecursion = (pattern) => {
      let depth = 0;
      let value = pattern.trim();
      let match = parseRepeatedExtglob(value);
      while (match) {
        depth++;
        value = match.body.trim();
        match = parseRepeatedExtglob(value);
      }
      return depth;
    };
    var analyzeRepeatedExtglob = (body, options) => {
      if (options.maxExtglobRecursion === false) {
        return { risky: false };
      }
      const max = typeof options.maxExtglobRecursion === "number" ? options.maxExtglobRecursion : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
      const branches = splitTopLevel(body).map((branch) => branch.trim());
      if (branches.length > 1) {
        if (branches.some((branch) => branch === "") || branches.some((branch) => /^[*?]+$/.test(branch)) || hasRepeatedCharPrefixOverlap(branches)) {
          return { risky: true };
        }
      }
      const safeChars = [];
      let sawStarSequence = false;
      let combinable = true;
      for (const branch of branches) {
        const chars = getStarExtglobSequenceChars(branch);
        if (chars) {
          sawStarSequence = true;
          safeChars.push(...chars);
          continue;
        }
        const literal = normalizeSimpleBranch(branch);
        if (literal && literal.length === 1) {
          safeChars.push(literal);
          continue;
        }
        combinable = false;
        if (repeatedExtglobRecursion(branch) > max) {
          return { risky: true };
        }
      }
      if (sawStarSequence) {
        return combinable ? { risky: true, safeOutput: buildCharClassStar([...new Set(safeChars)]) } : { risky: true };
      }
      return { risky: false };
    };
    var parse = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const PLATFORM_CHARS = constants.globChars(opts.windows);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.output = (prev.output || prev.value) + tok.value;
          prev.value += tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        token.startIndex = state.index;
        token.tokensIndex = tokens.length;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        const literal = input.slice(token.startIndex, state.index + 1);
        const body = input.slice(token.startIndex + 2, state.index);
        const analysis = analyzeRepeatedExtglob(body, opts);
        if ((token.type === "plus" || token.type === "star") && analysis.risky) {
          const safeOutput = analysis.safeOutput ? (token.output ? "" : ONE_CHAR) + (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput) : void 0;
          const open = tokens[token.tokensIndex];
          open.type = "text";
          open.value = literal;
          open.output = safeOutput || utils.escapeRegex(literal);
          for (let i = token.tokensIndex + 1; i < tokens.length; i++) {
            tokens[i].value = "";
            tokens[i].output = "";
            delete tokens[i].suffix;
          }
          state.output = token.output + open.output;
          state.backtrack = true;
          push({ type: "paren", extglob: true, value, output: "" });
          decrement("parens");
          return;
        }
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix2 = POSIX_REGEX_SOURCE[rest2];
                if (posix2) {
                  prev.value = pre + posix2;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open);
          push(open);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) {
              state.output += t.output || t.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          const isEnd = eos() || state.parens > 0 && rest === ")".repeat(state.parens) && !extglobs.some((extglob) => extglob.type === "negate");
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && isEnd) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(opts.windows);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source2 = create(match[1]);
            if (!source2) return;
            return source2 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source = create(output);
      if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
      }
      return source;
    };
    module2.exports = parse;
  }
});

// node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "node_modules/picomatch/lib/picomatch.js"(exports2, module2) {
    "use strict";
    var scan = require_scan();
    var parse = require_parse();
    var utils = require_utils();
    var constants = require_constants();
    var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch7 = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch7(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix2 = opts.windows;
      const regex = isState ? picomatch7.compileRe(glob, options) : picomatch7.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch7(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch7.test(input, regex, options, { glob, posix: posix2 });
        const result = { glob, state, regex, posix: posix2, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result);
        }
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result);
          }
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result);
        }
        return returnObject ? result : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch7.test = (input, regex, options, { glob, posix: posix2 } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix2 ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch7.matchBase(input, regex, options, posix2);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch7.matchBase = (input, glob, options, posix2 = options && options.windows) => {
      const regex = glob instanceof RegExp ? glob : picomatch7.makeRe(glob, options);
      return regex.test(utils.basename(input, { windows: posix2 }));
    };
    picomatch7.isMatch = (str, patterns, options) => picomatch7(patterns, options)(str);
    picomatch7.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch7.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch7.scan = (input, options) => scan(input, options);
    picomatch7.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
      }
      const regex = picomatch7.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch7.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse(input, options);
      }
      return picomatch7.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch7.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch7.constants = constants;
    module2.exports = picomatch7;
  }
});

// node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "node_modules/picomatch/index.js"(exports2, module2) {
    "use strict";
    var pico = require_picomatch();
    var utils = require_utils();
    function picomatch7(glob, options, returnState = false) {
      if (options && (options.windows === null || options.windows === void 0)) {
        options = { ...options, windows: utils.isWindows() };
      }
      return pico(glob, options, returnState);
    }
    Object.assign(picomatch7, pico);
    module2.exports = picomatch7;
  }
});

// node_modules/fast-glob/out/utils/array.js
var require_array = __commonJS({
  "node_modules/fast-glob/out/utils/array.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.splitWhen = exports2.flatten = void 0;
    function flatten(items) {
      return items.reduce((collection, item) => [].concat(collection, item), []);
    }
    exports2.flatten = flatten;
    function splitWhen(items, predicate) {
      const result = [[]];
      let groupIndex = 0;
      for (const item of items) {
        if (predicate(item)) {
          groupIndex++;
          result[groupIndex] = [];
        } else {
          result[groupIndex].push(item);
        }
      }
      return result;
    }
    exports2.splitWhen = splitWhen;
  }
});

// node_modules/fast-glob/out/utils/errno.js
var require_errno = __commonJS({
  "node_modules/fast-glob/out/utils/errno.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isEnoentCodeError = void 0;
    function isEnoentCodeError(error) {
      return error.code === "ENOENT";
    }
    exports2.isEnoentCodeError = isEnoentCodeError;
  }
});

// node_modules/fast-glob/out/utils/fs.js
var require_fs = __commonJS({
  "node_modules/fast-glob/out/utils/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDirentFromStats = void 0;
    var DirentFromStats = class {
      constructor(name, stats) {
        this.name = name;
        this.isBlockDevice = stats.isBlockDevice.bind(stats);
        this.isCharacterDevice = stats.isCharacterDevice.bind(stats);
        this.isDirectory = stats.isDirectory.bind(stats);
        this.isFIFO = stats.isFIFO.bind(stats);
        this.isFile = stats.isFile.bind(stats);
        this.isSocket = stats.isSocket.bind(stats);
        this.isSymbolicLink = stats.isSymbolicLink.bind(stats);
      }
    };
    function createDirentFromStats(name, stats) {
      return new DirentFromStats(name, stats);
    }
    exports2.createDirentFromStats = createDirentFromStats;
  }
});

// node_modules/fast-glob/out/utils/path.js
var require_path = __commonJS({
  "node_modules/fast-glob/out/utils/path.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.convertPosixPathToPattern = exports2.convertWindowsPathToPattern = exports2.convertPathToPattern = exports2.escapePosixPath = exports2.escapeWindowsPath = exports2.escape = exports2.removeLeadingDotSegment = exports2.makeAbsolute = exports2.unixify = void 0;
    var os2 = require("os");
    var path47 = require("path");
    var IS_WINDOWS_PLATFORM = os2.platform() === "win32";
    var LEADING_DOT_SEGMENT_CHARACTERS_COUNT = 2;
    var POSIX_UNESCAPED_GLOB_SYMBOLS_RE = /(\\?)([()*?[\]{|}]|^!|[!+@](?=\()|\\(?![!()*+?@[\]{|}]))/g;
    var WINDOWS_UNESCAPED_GLOB_SYMBOLS_RE = /(\\?)([()[\]{}]|^!|[!+@](?=\())/g;
    var DOS_DEVICE_PATH_RE = /^\\\\([.?])/;
    var WINDOWS_BACKSLASHES_RE = /\\(?![!()+@[\]{}])/g;
    function unixify(filepath) {
      return filepath.replace(/\\/g, "/");
    }
    exports2.unixify = unixify;
    function makeAbsolute(cwd, filepath) {
      return path47.resolve(cwd, filepath);
    }
    exports2.makeAbsolute = makeAbsolute;
    function removeLeadingDotSegment(entry) {
      if (entry.charAt(0) === ".") {
        const secondCharactery = entry.charAt(1);
        if (secondCharactery === "/" || secondCharactery === "\\") {
          return entry.slice(LEADING_DOT_SEGMENT_CHARACTERS_COUNT);
        }
      }
      return entry;
    }
    exports2.removeLeadingDotSegment = removeLeadingDotSegment;
    exports2.escape = IS_WINDOWS_PLATFORM ? escapeWindowsPath : escapePosixPath;
    function escapeWindowsPath(pattern) {
      return pattern.replace(WINDOWS_UNESCAPED_GLOB_SYMBOLS_RE, "\\$2");
    }
    exports2.escapeWindowsPath = escapeWindowsPath;
    function escapePosixPath(pattern) {
      return pattern.replace(POSIX_UNESCAPED_GLOB_SYMBOLS_RE, "\\$2");
    }
    exports2.escapePosixPath = escapePosixPath;
    exports2.convertPathToPattern = IS_WINDOWS_PLATFORM ? convertWindowsPathToPattern : convertPosixPathToPattern;
    function convertWindowsPathToPattern(filepath) {
      return escapeWindowsPath(filepath).replace(DOS_DEVICE_PATH_RE, "//$1").replace(WINDOWS_BACKSLASHES_RE, "/");
    }
    exports2.convertWindowsPathToPattern = convertWindowsPathToPattern;
    function convertPosixPathToPattern(filepath) {
      return escapePosixPath(filepath);
    }
    exports2.convertPosixPathToPattern = convertPosixPathToPattern;
  }
});

// node_modules/is-extglob/index.js
var require_is_extglob = __commonJS({
  "node_modules/is-extglob/index.js"(exports2, module2) {
    module2.exports = function isExtglob(str) {
      if (typeof str !== "string" || str === "") {
        return false;
      }
      var match;
      while (match = /(\\).|([@?!+*]\(.*\))/g.exec(str)) {
        if (match[2]) return true;
        str = str.slice(match.index + match[0].length);
      }
      return false;
    };
  }
});

// node_modules/is-glob/index.js
var require_is_glob = __commonJS({
  "node_modules/is-glob/index.js"(exports2, module2) {
    var isExtglob = require_is_extglob();
    var chars = { "{": "}", "(": ")", "[": "]" };
    var strictCheck = function(str) {
      if (str[0] === "!") {
        return true;
      }
      var index = 0;
      var pipeIndex = -2;
      var closeSquareIndex = -2;
      var closeCurlyIndex = -2;
      var closeParenIndex = -2;
      var backSlashIndex = -2;
      while (index < str.length) {
        if (str[index] === "*") {
          return true;
        }
        if (str[index + 1] === "?" && /[\].+)]/.test(str[index])) {
          return true;
        }
        if (closeSquareIndex !== -1 && str[index] === "[" && str[index + 1] !== "]") {
          if (closeSquareIndex < index) {
            closeSquareIndex = str.indexOf("]", index);
          }
          if (closeSquareIndex > index) {
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) {
              return true;
            }
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) {
              return true;
            }
          }
        }
        if (closeCurlyIndex !== -1 && str[index] === "{" && str[index + 1] !== "}") {
          closeCurlyIndex = str.indexOf("}", index);
          if (closeCurlyIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeCurlyIndex) {
              return true;
            }
          }
        }
        if (closeParenIndex !== -1 && str[index] === "(" && str[index + 1] === "?" && /[:!=]/.test(str[index + 2]) && str[index + 3] !== ")") {
          closeParenIndex = str.indexOf(")", index);
          if (closeParenIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) {
              return true;
            }
          }
        }
        if (pipeIndex !== -1 && str[index] === "(" && str[index + 1] !== "|") {
          if (pipeIndex < index) {
            pipeIndex = str.indexOf("|", index);
          }
          if (pipeIndex !== -1 && str[pipeIndex + 1] !== ")") {
            closeParenIndex = str.indexOf(")", pipeIndex);
            if (closeParenIndex > pipeIndex) {
              backSlashIndex = str.indexOf("\\", pipeIndex);
              if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) {
                return true;
              }
            }
          }
        }
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) {
              index = n + 1;
            }
          }
          if (str[index] === "!") {
            return true;
          }
        } else {
          index++;
        }
      }
      return false;
    };
    var relaxedCheck = function(str) {
      if (str[0] === "!") {
        return true;
      }
      var index = 0;
      while (index < str.length) {
        if (/[*?{}()[\]]/.test(str[index])) {
          return true;
        }
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) {
              index = n + 1;
            }
          }
          if (str[index] === "!") {
            return true;
          }
        } else {
          index++;
        }
      }
      return false;
    };
    module2.exports = function isGlob(str, options) {
      if (typeof str !== "string" || str === "") {
        return false;
      }
      if (isExtglob(str)) {
        return true;
      }
      var check = strictCheck;
      if (options && options.strict === false) {
        check = relaxedCheck;
      }
      return check(str);
    };
  }
});

// node_modules/glob-parent/index.js
var require_glob_parent = __commonJS({
  "node_modules/glob-parent/index.js"(exports2, module2) {
    "use strict";
    var isGlob = require_is_glob();
    var pathPosixDirname = require("path").posix.dirname;
    var isWin32 = require("os").platform() === "win32";
    var slash = "/";
    var backslash = /\\/g;
    var enclosure = /[\{\[].*[\}\]]$/;
    var globby = /(^|[^\\])([\{\[]|\([^\)]+$)/;
    var escaped = /\\([\!\*\?\|\[\]\(\)\{\}])/g;
    module2.exports = function globParent(str, opts) {
      var options = Object.assign({ flipBackslashes: true }, opts);
      if (options.flipBackslashes && isWin32 && str.indexOf(slash) < 0) {
        str = str.replace(backslash, slash);
      }
      if (enclosure.test(str)) {
        str += slash;
      }
      str += "a";
      do {
        str = pathPosixDirname(str);
      } while (isGlob(str) || globby.test(str));
      return str.replace(escaped, "$1");
    };
  }
});

// node_modules/braces/lib/utils.js
var require_utils2 = __commonJS({
  "node_modules/braces/lib/utils.js"(exports2) {
    "use strict";
    exports2.isInteger = (num) => {
      if (typeof num === "number") {
        return Number.isInteger(num);
      }
      if (typeof num === "string" && num.trim() !== "") {
        return Number.isInteger(Number(num));
      }
      return false;
    };
    exports2.find = (node, type) => node.nodes.find((node2) => node2.type === type);
    exports2.exceedsLimit = (min, max, step2 = 1, limit) => {
      if (limit === false) return false;
      if (!exports2.isInteger(min) || !exports2.isInteger(max)) return false;
      return (Number(max) - Number(min)) / Number(step2) >= limit;
    };
    exports2.escapeNode = (block, n = 0, type) => {
      const node = block.nodes[n];
      if (!node) return;
      if (type && node.type === type || node.type === "open" || node.type === "close") {
        if (node.escaped !== true) {
          node.value = "\\" + node.value;
          node.escaped = true;
        }
      }
    };
    exports2.encloseBrace = (node) => {
      if (node.type !== "brace") return false;
      if (node.commas >> 0 + node.ranges >> 0 === 0) {
        node.invalid = true;
        return true;
      }
      return false;
    };
    exports2.isInvalidBrace = (block) => {
      if (block.type !== "brace") return false;
      if (block.invalid === true || block.dollar) return true;
      if (block.commas >> 0 + block.ranges >> 0 === 0) {
        block.invalid = true;
        return true;
      }
      if (block.open !== true || block.close !== true) {
        block.invalid = true;
        return true;
      }
      return false;
    };
    exports2.isOpenOrClose = (node) => {
      if (node.type === "open" || node.type === "close") {
        return true;
      }
      return node.open === true || node.close === true;
    };
    exports2.reduce = (nodes) => nodes.reduce((acc, node) => {
      if (node.type === "text") acc.push(node.value);
      if (node.type === "range") node.type = "text";
      return acc;
    }, []);
    exports2.flatten = (...args) => {
      const result = [];
      const flat = (arr) => {
        for (let i = 0; i < arr.length; i++) {
          const ele = arr[i];
          if (Array.isArray(ele)) {
            flat(ele);
            continue;
          }
          if (ele !== void 0) {
            result.push(ele);
          }
        }
        return result;
      };
      flat(args);
      return result;
    };
  }
});

// node_modules/braces/lib/stringify.js
var require_stringify = __commonJS({
  "node_modules/braces/lib/stringify.js"(exports2, module2) {
    "use strict";
    var utils = require_utils2();
    module2.exports = (ast, options = {}) => {
      const stringify = (node, parent = {}) => {
        const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
        const invalidNode = node.invalid === true && options.escapeInvalid === true;
        let output = "";
        if (node.value) {
          if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
            return "\\" + node.value;
          }
          return node.value;
        }
        if (node.value) {
          return node.value;
        }
        if (node.nodes) {
          for (const child of node.nodes) {
            output += stringify(child);
          }
        }
        return output;
      };
      return stringify(ast);
    };
  }
});

// node_modules/is-number/index.js
var require_is_number = __commonJS({
  "node_modules/is-number/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function(num) {
      if (typeof num === "number") {
        return num - num === 0;
      }
      if (typeof num === "string" && num.trim() !== "") {
        return Number.isFinite ? Number.isFinite(+num) : isFinite(+num);
      }
      return false;
    };
  }
});

// node_modules/to-regex-range/index.js
var require_to_regex_range = __commonJS({
  "node_modules/to-regex-range/index.js"(exports2, module2) {
    "use strict";
    var isNumber = require_is_number();
    var toRegexRange = (min, max, options) => {
      if (isNumber(min) === false) {
        throw new TypeError("toRegexRange: expected the first argument to be a number");
      }
      if (max === void 0 || min === max) {
        return String(min);
      }
      if (isNumber(max) === false) {
        throw new TypeError("toRegexRange: expected the second argument to be a number.");
      }
      let opts = { relaxZeros: true, ...options };
      if (typeof opts.strictZeros === "boolean") {
        opts.relaxZeros = opts.strictZeros === false;
      }
      let relax = String(opts.relaxZeros);
      let shorthand = String(opts.shorthand);
      let capture = String(opts.capture);
      let wrap = String(opts.wrap);
      let cacheKey = min + ":" + max + "=" + relax + shorthand + capture + wrap;
      if (toRegexRange.cache.hasOwnProperty(cacheKey)) {
        return toRegexRange.cache[cacheKey].result;
      }
      let a = Math.min(min, max);
      let b = Math.max(min, max);
      if (Math.abs(a - b) === 1) {
        let result = min + "|" + max;
        if (opts.capture) {
          return `(${result})`;
        }
        if (opts.wrap === false) {
          return result;
        }
        return `(?:${result})`;
      }
      let isPadded = hasPadding(min) || hasPadding(max);
      let state = { min, max, a, b };
      let positives = [];
      let negatives = [];
      if (isPadded) {
        state.isPadded = isPadded;
        state.maxLen = String(state.max).length;
      }
      if (a < 0) {
        let newMin = b < 0 ? Math.abs(b) : 1;
        negatives = splitToPatterns(newMin, Math.abs(a), state, opts);
        a = state.a = 0;
      }
      if (b >= 0) {
        positives = splitToPatterns(a, b, state, opts);
      }
      state.negatives = negatives;
      state.positives = positives;
      state.result = collatePatterns(negatives, positives, opts);
      if (opts.capture === true) {
        state.result = `(${state.result})`;
      } else if (opts.wrap !== false && positives.length + negatives.length > 1) {
        state.result = `(?:${state.result})`;
      }
      toRegexRange.cache[cacheKey] = state;
      return state.result;
    };
    function collatePatterns(neg, pos, options) {
      let onlyNegative = filterPatterns(neg, pos, "-", false, options) || [];
      let onlyPositive = filterPatterns(pos, neg, "", false, options) || [];
      let intersected = filterPatterns(neg, pos, "-?", true, options) || [];
      let subpatterns = onlyNegative.concat(intersected).concat(onlyPositive);
      return subpatterns.join("|");
    }
    function splitToRanges(min, max) {
      let nines = 1;
      let zeros = 1;
      let stop = countNines(min, nines);
      let stops = /* @__PURE__ */ new Set([max]);
      while (min <= stop && stop <= max) {
        stops.add(stop);
        nines += 1;
        stop = countNines(min, nines);
      }
      stop = countZeros(max + 1, zeros) - 1;
      while (min < stop && stop <= max) {
        stops.add(stop);
        zeros += 1;
        stop = countZeros(max + 1, zeros) - 1;
      }
      stops = [...stops];
      stops.sort(compare);
      return stops;
    }
    function rangeToPattern(start, stop, options) {
      if (start === stop) {
        return { pattern: start, count: [], digits: 0 };
      }
      let zipped = zip(start, stop);
      let digits = zipped.length;
      let pattern = "";
      let count = 0;
      for (let i = 0; i < digits; i++) {
        let [startDigit, stopDigit] = zipped[i];
        if (startDigit === stopDigit) {
          pattern += startDigit;
        } else if (startDigit !== "0" || stopDigit !== "9") {
          pattern += toCharacterClass(startDigit, stopDigit, options);
        } else {
          count++;
        }
      }
      if (count) {
        pattern += options.shorthand === true ? "\\d" : "[0-9]";
      }
      return { pattern, count: [count], digits };
    }
    function splitToPatterns(min, max, tok, options) {
      let ranges = splitToRanges(min, max);
      let tokens = [];
      let start = min;
      let prev;
      for (let i = 0; i < ranges.length; i++) {
        let max2 = ranges[i];
        let obj = rangeToPattern(String(start), String(max2), options);
        let zeros = "";
        if (!tok.isPadded && prev && prev.pattern === obj.pattern) {
          if (prev.count.length > 1) {
            prev.count.pop();
          }
          prev.count.push(obj.count[0]);
          prev.string = prev.pattern + toQuantifier(prev.count);
          start = max2 + 1;
          continue;
        }
        if (tok.isPadded) {
          zeros = padZeros(max2, tok, options);
        }
        obj.string = zeros + obj.pattern + toQuantifier(obj.count);
        tokens.push(obj);
        start = max2 + 1;
        prev = obj;
      }
      return tokens;
    }
    function filterPatterns(arr, comparison, prefix, intersection, options) {
      let result = [];
      for (let ele of arr) {
        let { string } = ele;
        if (!intersection && !contains(comparison, "string", string)) {
          result.push(prefix + string);
        }
        if (intersection && contains(comparison, "string", string)) {
          result.push(prefix + string);
        }
      }
      return result;
    }
    function zip(a, b) {
      let arr = [];
      for (let i = 0; i < a.length; i++) arr.push([a[i], b[i]]);
      return arr;
    }
    function compare(a, b) {
      return a > b ? 1 : b > a ? -1 : 0;
    }
    function contains(arr, key, val) {
      return arr.some((ele) => ele[key] === val);
    }
    function countNines(min, len) {
      return Number(String(min).slice(0, -len) + "9".repeat(len));
    }
    function countZeros(integer, zeros) {
      return integer - integer % Math.pow(10, zeros);
    }
    function toQuantifier(digits) {
      let [start = 0, stop = ""] = digits;
      if (stop || start > 1) {
        return `{${start + (stop ? "," + stop : "")}}`;
      }
      return "";
    }
    function toCharacterClass(a, b, options) {
      return `[${a}${b - a === 1 ? "" : "-"}${b}]`;
    }
    function hasPadding(str) {
      return /^-?(0+)\d/.test(str);
    }
    function padZeros(value, tok, options) {
      if (!tok.isPadded) {
        return value;
      }
      let diff = Math.abs(tok.maxLen - String(value).length);
      let relax = options.relaxZeros !== false;
      switch (diff) {
        case 0:
          return "";
        case 1:
          return relax ? "0?" : "0";
        case 2:
          return relax ? "0{0,2}" : "00";
        default: {
          return relax ? `0{0,${diff}}` : `0{${diff}}`;
        }
      }
    }
    toRegexRange.cache = {};
    toRegexRange.clearCache = () => toRegexRange.cache = {};
    module2.exports = toRegexRange;
  }
});

// node_modules/fill-range/index.js
var require_fill_range = __commonJS({
  "node_modules/fill-range/index.js"(exports2, module2) {
    "use strict";
    var util2 = require("util");
    var toRegexRange = require_to_regex_range();
    var isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    var transform = (toNumber) => {
      return (value) => toNumber === true ? Number(value) : String(value);
    };
    var isValidValue = (value) => {
      return typeof value === "number" || typeof value === "string" && value !== "";
    };
    var isNumber = (num) => Number.isInteger(+num);
    var zeros = (input) => {
      let value = `${input}`;
      let index = -1;
      if (value[0] === "-") value = value.slice(1);
      if (value === "0") return false;
      while (value[++index] === "0") ;
      return index > 0;
    };
    var stringify = (start, end, options) => {
      if (typeof start === "string" || typeof end === "string") {
        return true;
      }
      return options.stringify === true;
    };
    var pad = (input, maxLength, toNumber) => {
      if (maxLength > 0) {
        let dash = input[0] === "-" ? "-" : "";
        if (dash) input = input.slice(1);
        input = dash + input.padStart(dash ? maxLength - 1 : maxLength, "0");
      }
      if (toNumber === false) {
        return String(input);
      }
      return input;
    };
    var toMaxLen = (input, maxLength) => {
      let negative = input[0] === "-" ? "-" : "";
      if (negative) {
        input = input.slice(1);
        maxLength--;
      }
      while (input.length < maxLength) input = "0" + input;
      return negative ? "-" + input : input;
    };
    var toSequence = (parts, options, maxLen) => {
      parts.negatives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      parts.positives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      let prefix = options.capture ? "" : "?:";
      let positives = "";
      let negatives = "";
      let result;
      if (parts.positives.length) {
        positives = parts.positives.map((v) => toMaxLen(String(v), maxLen)).join("|");
      }
      if (parts.negatives.length) {
        negatives = `-(${prefix}${parts.negatives.map((v) => toMaxLen(String(v), maxLen)).join("|")})`;
      }
      if (positives && negatives) {
        result = `${positives}|${negatives}`;
      } else {
        result = positives || negatives;
      }
      if (options.wrap) {
        return `(${prefix}${result})`;
      }
      return result;
    };
    var toRange = (a, b, isNumbers, options) => {
      if (isNumbers) {
        return toRegexRange(a, b, { wrap: false, ...options });
      }
      let start = String.fromCharCode(a);
      if (a === b) return start;
      let stop = String.fromCharCode(b);
      return `[${start}-${stop}]`;
    };
    var toRegex = (start, end, options) => {
      if (Array.isArray(start)) {
        let wrap = options.wrap === true;
        let prefix = options.capture ? "" : "?:";
        return wrap ? `(${prefix}${start.join("|")})` : start.join("|");
      }
      return toRegexRange(start, end, options);
    };
    var rangeError = (...args) => {
      return new RangeError("Invalid range arguments: " + util2.inspect(...args));
    };
    var invalidRange = (start, end, options) => {
      if (options.strictRanges === true) throw rangeError([start, end]);
      return [];
    };
    var invalidStep = (step2, options) => {
      if (options.strictRanges === true) {
        throw new TypeError(`Expected step "${step2}" to be a number`);
      }
      return [];
    };
    var fillNumbers = (start, end, step2 = 1, options = {}) => {
      let a = Number(start);
      let b = Number(end);
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        if (options.strictRanges === true) throw rangeError([start, end]);
        return [];
      }
      if (a === 0) a = 0;
      if (b === 0) b = 0;
      let descending = a > b;
      let startString = String(start);
      let endString = String(end);
      let stepString = String(step2);
      step2 = Math.max(Math.abs(step2), 1);
      let padded = zeros(startString) || zeros(endString) || zeros(stepString);
      let maxLen = padded ? Math.max(startString.length, endString.length, stepString.length) : 0;
      let toNumber = padded === false && stringify(start, end, options) === false;
      let format = options.transform || transform(toNumber);
      if (options.toRegex && step2 === 1) {
        return toRange(toMaxLen(start, maxLen), toMaxLen(end, maxLen), true, options);
      }
      let parts = { negatives: [], positives: [] };
      let push = (num) => parts[num < 0 ? "negatives" : "positives"].push(Math.abs(num));
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        if (options.toRegex === true && step2 > 1) {
          push(a);
        } else {
          range.push(pad(format(a, index), maxLen, toNumber));
        }
        a = descending ? a - step2 : a + step2;
        index++;
      }
      if (options.toRegex === true) {
        return step2 > 1 ? toSequence(parts, options, maxLen) : toRegex(range, null, { wrap: false, ...options });
      }
      return range;
    };
    var fillLetters = (start, end, step2 = 1, options = {}) => {
      if (!isNumber(start) && start.length > 1 || !isNumber(end) && end.length > 1) {
        return invalidRange(start, end, options);
      }
      let format = options.transform || ((val) => String.fromCharCode(val));
      let a = `${start}`.charCodeAt(0);
      let b = `${end}`.charCodeAt(0);
      let descending = a > b;
      let min = Math.min(a, b);
      let max = Math.max(a, b);
      if (options.toRegex && step2 === 1) {
        return toRange(min, max, false, options);
      }
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        range.push(format(a, index));
        a = descending ? a - step2 : a + step2;
        index++;
      }
      if (options.toRegex === true) {
        return toRegex(range, null, { wrap: false, options });
      }
      return range;
    };
    var fill = (start, end, step2, options = {}) => {
      if (end == null && isValidValue(start)) {
        return [start];
      }
      if (!isValidValue(start) || !isValidValue(end)) {
        return invalidRange(start, end, options);
      }
      if (typeof step2 === "function") {
        return fill(start, end, 1, { transform: step2 });
      }
      if (isObject(step2)) {
        return fill(start, end, 0, step2);
      }
      let opts = { ...options };
      if (opts.capture === true) opts.wrap = true;
      step2 = step2 || opts.step || 1;
      if (!isNumber(step2)) {
        if (step2 != null && !isObject(step2)) return invalidStep(step2, opts);
        return fill(start, end, 1, step2);
      }
      if (isNumber(start) && isNumber(end)) {
        return fillNumbers(start, end, step2, opts);
      }
      return fillLetters(start, end, Math.max(Math.abs(step2), 1), opts);
    };
    module2.exports = fill;
  }
});

// node_modules/braces/lib/compile.js
var require_compile = __commonJS({
  "node_modules/braces/lib/compile.js"(exports2, module2) {
    "use strict";
    var fill = require_fill_range();
    var utils = require_utils2();
    var compile = (ast, options = {}) => {
      const walk2 = (node, parent = {}) => {
        const invalidBlock = utils.isInvalidBrace(parent);
        const invalidNode = node.invalid === true && options.escapeInvalid === true;
        const invalid = invalidBlock === true || invalidNode === true;
        const prefix = options.escapeInvalid === true ? "\\" : "";
        let output = "";
        if (node.isOpen === true) {
          return prefix + node.value;
        }
        if (node.isClose === true) {
          console.log("node.isClose", prefix, node.value);
          return prefix + node.value;
        }
        if (node.type === "open") {
          return invalid ? prefix + node.value : "(";
        }
        if (node.type === "close") {
          return invalid ? prefix + node.value : ")";
        }
        if (node.type === "comma") {
          return node.prev.type === "comma" ? "" : invalid ? node.value : "|";
        }
        if (node.value) {
          return node.value;
        }
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          const range = fill(...args, { ...options, wrap: false, toRegex: true, strictZeros: true });
          if (range.length !== 0) {
            return args.length > 1 && range.length > 1 ? `(${range})` : range;
          }
        }
        if (node.nodes) {
          for (const child of node.nodes) {
            output += walk2(child, node);
          }
        }
        return output;
      };
      return walk2(ast);
    };
    module2.exports = compile;
  }
});

// node_modules/braces/lib/expand.js
var require_expand = __commonJS({
  "node_modules/braces/lib/expand.js"(exports2, module2) {
    "use strict";
    var fill = require_fill_range();
    var stringify = require_stringify();
    var utils = require_utils2();
    var append = (queue = "", stash = "", enclose = false) => {
      const result = [];
      queue = [].concat(queue);
      stash = [].concat(stash);
      if (!stash.length) return queue;
      if (!queue.length) {
        return enclose ? utils.flatten(stash).map((ele) => `{${ele}}`) : stash;
      }
      for (const item of queue) {
        if (Array.isArray(item)) {
          for (const value of item) {
            result.push(append(value, stash, enclose));
          }
        } else {
          for (let ele of stash) {
            if (enclose === true && typeof ele === "string") ele = `{${ele}}`;
            result.push(Array.isArray(ele) ? append(item, ele, enclose) : item + ele);
          }
        }
      }
      return utils.flatten(result);
    };
    var expand = (ast, options = {}) => {
      const rangeLimit = options.rangeLimit === void 0 ? 1e3 : options.rangeLimit;
      const walk2 = (node, parent = {}) => {
        node.queue = [];
        let p = parent;
        let q = parent.queue;
        while (p.type !== "brace" && p.type !== "root" && p.parent) {
          p = p.parent;
          q = p.queue;
        }
        if (node.invalid || node.dollar) {
          q.push(append(q.pop(), stringify(node, options)));
          return;
        }
        if (node.type === "brace" && node.invalid !== true && node.nodes.length === 2) {
          q.push(append(q.pop(), ["{}"]));
          return;
        }
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          if (utils.exceedsLimit(...args, options.step, rangeLimit)) {
            throw new RangeError("expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.");
          }
          let range = fill(...args, options);
          if (range.length === 0) {
            range = stringify(node, options);
          }
          q.push(append(q.pop(), range));
          node.nodes = [];
          return;
        }
        const enclose = utils.encloseBrace(node);
        let queue = node.queue;
        let block = node;
        while (block.type !== "brace" && block.type !== "root" && block.parent) {
          block = block.parent;
          queue = block.queue;
        }
        for (let i = 0; i < node.nodes.length; i++) {
          const child = node.nodes[i];
          if (child.type === "comma" && node.type === "brace") {
            if (i === 1) queue.push("");
            queue.push("");
            continue;
          }
          if (child.type === "close") {
            q.push(append(q.pop(), queue, enclose));
            continue;
          }
          if (child.value && child.type !== "open") {
            queue.push(append(queue.pop(), child.value));
            continue;
          }
          if (child.nodes) {
            walk2(child, node);
          }
        }
        return queue;
      };
      return utils.flatten(walk2(ast));
    };
    module2.exports = expand;
  }
});

// node_modules/braces/lib/constants.js
var require_constants2 = __commonJS({
  "node_modules/braces/lib/constants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      MAX_LENGTH: 1e4,
      // Digits
      CHAR_0: "0",
      /* 0 */
      CHAR_9: "9",
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: "A",
      /* A */
      CHAR_LOWERCASE_A: "a",
      /* a */
      CHAR_UPPERCASE_Z: "Z",
      /* Z */
      CHAR_LOWERCASE_Z: "z",
      /* z */
      CHAR_LEFT_PARENTHESES: "(",
      /* ( */
      CHAR_RIGHT_PARENTHESES: ")",
      /* ) */
      CHAR_ASTERISK: "*",
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: "&",
      /* & */
      CHAR_AT: "@",
      /* @ */
      CHAR_BACKSLASH: "\\",
      /* \ */
      CHAR_BACKTICK: "`",
      /* ` */
      CHAR_CARRIAGE_RETURN: "\r",
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: "^",
      /* ^ */
      CHAR_COLON: ":",
      /* : */
      CHAR_COMMA: ",",
      /* , */
      CHAR_DOLLAR: "$",
      /* . */
      CHAR_DOT: ".",
      /* . */
      CHAR_DOUBLE_QUOTE: '"',
      /* " */
      CHAR_EQUAL: "=",
      /* = */
      CHAR_EXCLAMATION_MARK: "!",
      /* ! */
      CHAR_FORM_FEED: "\f",
      /* \f */
      CHAR_FORWARD_SLASH: "/",
      /* / */
      CHAR_HASH: "#",
      /* # */
      CHAR_HYPHEN_MINUS: "-",
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: "<",
      /* < */
      CHAR_LEFT_CURLY_BRACE: "{",
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: "[",
      /* [ */
      CHAR_LINE_FEED: "\n",
      /* \n */
      CHAR_NO_BREAK_SPACE: "\xA0",
      /* \u00A0 */
      CHAR_PERCENT: "%",
      /* % */
      CHAR_PLUS: "+",
      /* + */
      CHAR_QUESTION_MARK: "?",
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: ">",
      /* > */
      CHAR_RIGHT_CURLY_BRACE: "}",
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: "]",
      /* ] */
      CHAR_SEMICOLON: ";",
      /* ; */
      CHAR_SINGLE_QUOTE: "'",
      /* ' */
      CHAR_SPACE: " ",
      /*   */
      CHAR_TAB: "	",
      /* \t */
      CHAR_UNDERSCORE: "_",
      /* _ */
      CHAR_VERTICAL_LINE: "|",
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: "\uFEFF"
      /* \uFEFF */
    };
  }
});

// node_modules/braces/lib/parse.js
var require_parse2 = __commonJS({
  "node_modules/braces/lib/parse.js"(exports2, module2) {
    "use strict";
    var stringify = require_stringify();
    var {
      MAX_LENGTH,
      CHAR_BACKSLASH,
      /* \ */
      CHAR_BACKTICK,
      /* ` */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_RIGHT_SQUARE_BRACKET,
      /* ] */
      CHAR_DOUBLE_QUOTE,
      /* " */
      CHAR_SINGLE_QUOTE,
      /* ' */
      CHAR_NO_BREAK_SPACE,
      CHAR_ZERO_WIDTH_NOBREAK_SPACE
    } = require_constants2();
    var parse = (input, options = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      const opts = options || {};
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      if (input.length > max) {
        throw new SyntaxError(`Input length (${input.length}), exceeds max characters (${max})`);
      }
      const ast = { type: "root", input, nodes: [] };
      const stack = [ast];
      let block = ast;
      let prev = ast;
      let brackets = 0;
      const length = input.length;
      let index = 0;
      let depth = 0;
      let value;
      const advance = () => input[index++];
      const push = (node) => {
        if (node.type === "text" && prev.type === "dot") {
          prev.type = "text";
        }
        if (prev && prev.type === "text" && node.type === "text") {
          prev.value += node.value;
          return;
        }
        block.nodes.push(node);
        node.parent = block;
        node.prev = prev;
        prev = node;
        return node;
      };
      push({ type: "bos" });
      while (index < length) {
        block = stack[stack.length - 1];
        value = advance();
        if (value === CHAR_ZERO_WIDTH_NOBREAK_SPACE || value === CHAR_NO_BREAK_SPACE) {
          continue;
        }
        if (value === CHAR_BACKSLASH) {
          push({ type: "text", value: (options.keepEscaping ? value : "") + advance() });
          continue;
        }
        if (value === CHAR_RIGHT_SQUARE_BRACKET) {
          push({ type: "text", value: "\\" + value });
          continue;
        }
        if (value === CHAR_LEFT_SQUARE_BRACKET) {
          brackets++;
          let next;
          while (index < length && (next = advance())) {
            value += next;
            if (next === CHAR_LEFT_SQUARE_BRACKET) {
              brackets++;
              continue;
            }
            if (next === CHAR_BACKSLASH) {
              value += advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              brackets--;
              if (brackets === 0) {
                break;
              }
            }
          }
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_LEFT_PARENTHESES) {
          block = push({ type: "paren", nodes: [] });
          stack.push(block);
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_RIGHT_PARENTHESES) {
          if (block.type !== "paren") {
            push({ type: "text", value });
            continue;
          }
          block = stack.pop();
          push({ type: "text", value });
          block = stack[stack.length - 1];
          continue;
        }
        if (value === CHAR_DOUBLE_QUOTE || value === CHAR_SINGLE_QUOTE || value === CHAR_BACKTICK) {
          const open = value;
          let next;
          if (options.keepQuotes !== true) {
            value = "";
          }
          while (index < length && (next = advance())) {
            if (next === CHAR_BACKSLASH) {
              value += next + advance();
              continue;
            }
            if (next === open) {
              if (options.keepQuotes === true) value += next;
              break;
            }
            value += next;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_LEFT_CURLY_BRACE) {
          depth++;
          const dollar = prev.value && prev.value.slice(-1) === "$" || block.dollar === true;
          const brace = {
            type: "brace",
            open: true,
            close: false,
            dollar,
            depth,
            commas: 0,
            ranges: 0,
            nodes: []
          };
          block = push(brace);
          stack.push(block);
          push({ type: "open", value });
          continue;
        }
        if (value === CHAR_RIGHT_CURLY_BRACE) {
          if (block.type !== "brace") {
            push({ type: "text", value });
            continue;
          }
          const type = "close";
          block = stack.pop();
          block.close = true;
          push({ type, value });
          depth--;
          block = stack[stack.length - 1];
          continue;
        }
        if (value === CHAR_COMMA && depth > 0) {
          if (block.ranges > 0) {
            block.ranges = 0;
            const open = block.nodes.shift();
            block.nodes = [open, { type: "text", value: stringify(block) }];
          }
          push({ type: "comma", value });
          block.commas++;
          continue;
        }
        if (value === CHAR_DOT && depth > 0 && block.commas === 0) {
          const siblings = block.nodes;
          if (depth === 0 || siblings.length === 0) {
            push({ type: "text", value });
            continue;
          }
          if (prev.type === "dot") {
            block.range = [];
            prev.value += value;
            prev.type = "range";
            if (block.nodes.length !== 3 && block.nodes.length !== 5) {
              block.invalid = true;
              block.ranges = 0;
              prev.type = "text";
              continue;
            }
            block.ranges++;
            block.args = [];
            continue;
          }
          if (prev.type === "range") {
            siblings.pop();
            const before = siblings[siblings.length - 1];
            before.value += prev.value + value;
            prev = before;
            block.ranges--;
            continue;
          }
          push({ type: "dot", value });
          continue;
        }
        push({ type: "text", value });
      }
      do {
        block = stack.pop();
        if (block.type !== "root") {
          block.nodes.forEach((node) => {
            if (!node.nodes) {
              if (node.type === "open") node.isOpen = true;
              if (node.type === "close") node.isClose = true;
              if (!node.nodes) node.type = "text";
              node.invalid = true;
            }
          });
          const parent = stack[stack.length - 1];
          const index2 = parent.nodes.indexOf(block);
          parent.nodes.splice(index2, 1, ...block.nodes);
        }
      } while (stack.length > 0);
      push({ type: "eos" });
      return ast;
    };
    module2.exports = parse;
  }
});

// node_modules/braces/index.js
var require_braces = __commonJS({
  "node_modules/braces/index.js"(exports2, module2) {
    "use strict";
    var stringify = require_stringify();
    var compile = require_compile();
    var expand = require_expand();
    var parse = require_parse2();
    var braces = (input, options = {}) => {
      let output = [];
      if (Array.isArray(input)) {
        for (const pattern of input) {
          const result = braces.create(pattern, options);
          if (Array.isArray(result)) {
            output.push(...result);
          } else {
            output.push(result);
          }
        }
      } else {
        output = [].concat(braces.create(input, options));
      }
      if (options && options.expand === true && options.nodupes === true) {
        output = [...new Set(output)];
      }
      return output;
    };
    braces.parse = (input, options = {}) => parse(input, options);
    braces.stringify = (input, options = {}) => {
      if (typeof input === "string") {
        return stringify(braces.parse(input, options), options);
      }
      return stringify(input, options);
    };
    braces.compile = (input, options = {}) => {
      if (typeof input === "string") {
        input = braces.parse(input, options);
      }
      return compile(input, options);
    };
    braces.expand = (input, options = {}) => {
      if (typeof input === "string") {
        input = braces.parse(input, options);
      }
      let result = expand(input, options);
      if (options.noempty === true) {
        result = result.filter(Boolean);
      }
      if (options.nodupes === true) {
        result = [...new Set(result)];
      }
      return result;
    };
    braces.create = (input, options = {}) => {
      if (input === "" || input.length < 3) {
        return [input];
      }
      return options.expand !== true ? braces.compile(input, options) : braces.expand(input, options);
    };
    module2.exports = braces;
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/constants.js
var require_constants3 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/constants.js"(exports2, module2) {
    "use strict";
    var path47 = require("path");
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DEFAULT_MAX_EXTGLOB_RECURSION = 0;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`
    };
    var POSIX_REGEX_SOURCE = {
      __proto__: null,
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module2.exports = {
      DEFAULT_MAX_EXTGLOB_RECURSION,
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        __proto__: null,
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      SEP: path47.sep,
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/utils.js
var require_utils3 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/utils.js"(exports2) {
    "use strict";
    var path47 = require("path");
    var win32 = process.platform === "win32";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants3();
    exports2.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports2.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports2.isRegexChar = (str) => str.length === 1 && exports2.hasRegexChars(str);
    exports2.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports2.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports2.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports2.supportsLookbehinds = () => {
      const segs = process.version.slice(1).split(".").map(Number);
      if (segs.length === 3 && segs[0] >= 9 || segs[0] === 8 && segs[1] >= 10) {
        return true;
      }
      return false;
    };
    exports2.isWindows = (options) => {
      if (options && typeof options.windows === "boolean") {
        return options.windows;
      }
      return win32 === true || path47.sep === "\\";
    };
    exports2.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports2.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports2.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports2.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/scan.js
var require_scan2 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/scan.js"(exports2, module2) {
    "use strict";
    var utils = require_utils3();
    var {
      CHAR_ASTERISK,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET
      /* ] */
    } = require_constants3();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  code = advance();
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES) {
                  isGlob = token.isGlob = true;
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_LEFT_PARENTHESES) {
                backslashes = token.backslashes = true;
                code = advance();
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else {
        base = str;
      }
      if (base && base !== "" && base !== "/" && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n = prevIndex ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value = input.slice(n, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (idx !== 0 || value !== "") {
            parts.push(value);
          }
          prevIndex = i;
        }
        if (prevIndex && prevIndex + 1 < input.length) {
          const value = input.slice(prevIndex + 1);
          parts.push(value);
          if (opts.tokens) {
            tokens[tokens.length - 1].value = value;
            depth(tokens[tokens.length - 1]);
            state.maxDepth += tokens[tokens.length - 1].depth;
          }
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module2.exports = scan;
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/parse.js
var require_parse3 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/parse.js"(exports2, module2) {
    "use strict";
    var constants = require_constants3();
    var utils = require_utils3();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var splitTopLevel = (input) => {
      const parts = [];
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let value = "";
      let escaped = false;
      for (const ch of input) {
        if (escaped === true) {
          value += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          value += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          value += ch;
          continue;
        }
        if (quote === 0) {
          if (ch === "[") {
            bracket++;
          } else if (ch === "]" && bracket > 0) {
            bracket--;
          } else if (bracket === 0) {
            if (ch === "(") {
              paren++;
            } else if (ch === ")" && paren > 0) {
              paren--;
            } else if (ch === "|" && paren === 0) {
              parts.push(value);
              value = "";
              continue;
            }
          }
        }
        value += ch;
      }
      parts.push(value);
      return parts;
    };
    var isPlainBranch = (branch) => {
      let escaped = false;
      for (const ch of branch) {
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (/[?*+@!()[\]{}]/.test(ch)) {
          return false;
        }
      }
      return true;
    };
    var normalizeSimpleBranch = (branch) => {
      let value = branch.trim();
      let changed = true;
      while (changed === true) {
        changed = false;
        if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
          value = value.slice(2, -1);
          changed = true;
        }
      }
      if (!isPlainBranch(value)) {
        return;
      }
      return value.replace(/\\(.)/g, "$1");
    };
    var hasRepeatedCharPrefixOverlap = (branches) => {
      const values = branches.map(normalizeSimpleBranch).filter(Boolean);
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const a = values[i];
          const b = values[j];
          const char = a[0];
          if (!char || a !== char.repeat(a.length) || b !== char.repeat(b.length)) {
            continue;
          }
          if (a === b || a.startsWith(b) || b.startsWith(a)) {
            return true;
          }
        }
      }
      return false;
    };
    var parseRepeatedExtglob = (pattern, requireEnd = true) => {
      if (pattern[0] !== "+" && pattern[0] !== "*" || pattern[1] !== "(") {
        return;
      }
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let escaped = false;
      for (let i = 1; i < pattern.length; i++) {
        const ch = pattern[i];
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          continue;
        }
        if (quote === 1) {
          continue;
        }
        if (ch === "[") {
          bracket++;
          continue;
        }
        if (ch === "]" && bracket > 0) {
          bracket--;
          continue;
        }
        if (bracket > 0) {
          continue;
        }
        if (ch === "(") {
          paren++;
          continue;
        }
        if (ch === ")") {
          paren--;
          if (paren === 0) {
            if (requireEnd === true && i !== pattern.length - 1) {
              return;
            }
            return {
              type: pattern[0],
              body: pattern.slice(2, i),
              end: i
            };
          }
        }
      }
    };
    var getStarExtglobSequenceOutput = (pattern) => {
      let index = 0;
      const chars = [];
      while (index < pattern.length) {
        const match = parseRepeatedExtglob(pattern.slice(index), false);
        if (!match || match.type !== "*") {
          return;
        }
        const branches = splitTopLevel(match.body).map((branch2) => branch2.trim());
        if (branches.length !== 1) {
          return;
        }
        const branch = normalizeSimpleBranch(branches[0]);
        if (!branch || branch.length !== 1) {
          return;
        }
        chars.push(branch);
        index += match.end + 1;
      }
      if (chars.length < 1) {
        return;
      }
      const source = chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch) => utils.escapeRegex(ch)).join("")}]`;
      return `${source}*`;
    };
    var repeatedExtglobRecursion = (pattern) => {
      let depth = 0;
      let value = pattern.trim();
      let match = parseRepeatedExtglob(value);
      while (match) {
        depth++;
        value = match.body.trim();
        match = parseRepeatedExtglob(value);
      }
      return depth;
    };
    var analyzeRepeatedExtglob = (body, options) => {
      if (options.maxExtglobRecursion === false) {
        return { risky: false };
      }
      const max = typeof options.maxExtglobRecursion === "number" ? options.maxExtglobRecursion : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
      const branches = splitTopLevel(body).map((branch) => branch.trim());
      if (branches.length > 1) {
        if (branches.some((branch) => branch === "") || branches.some((branch) => /^[*?]+$/.test(branch)) || hasRepeatedCharPrefixOverlap(branches)) {
          return { risky: true };
        }
      }
      for (const branch of branches) {
        const safeOutput = getStarExtglobSequenceOutput(branch);
        if (safeOutput) {
          return { risky: true, safeOutput };
        }
        if (repeatedExtglobRecursion(branch) > max) {
          return { risky: true };
        }
      }
      return { risky: false };
    };
    var parse = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const win32 = utils.isWindows(options);
      const PLATFORM_CHARS = constants.globChars(win32);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.value += tok.value;
          prev.output = (prev.output || "") + tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        token.startIndex = state.index;
        token.tokensIndex = tokens.length;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        const literal = input.slice(token.startIndex, state.index + 1);
        const body = input.slice(token.startIndex + 2, state.index);
        const analysis = analyzeRepeatedExtglob(body, opts);
        if ((token.type === "plus" || token.type === "star") && analysis.risky) {
          const safeOutput = analysis.safeOutput ? (token.output ? "" : ONE_CHAR) + (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput) : void 0;
          const open = tokens[token.tokensIndex];
          open.type = "text";
          open.value = literal;
          open.output = safeOutput || utils.escapeRegex(literal);
          for (let i = token.tokensIndex + 1; i < tokens.length; i++) {
            tokens[i].value = "";
            tokens[i].output = "";
            delete tokens[i].suffix;
          }
          state.output = token.output + open.output;
          state.backtrack = true;
          push({ type: "paren", extglob: true, value, output: "" });
          decrement("parens");
          return;
        }
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix2 = POSIX_REGEX_SOURCE[rest2];
                if (posix2) {
                  prev.value = pre + posix2;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open);
          push(open);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) {
              state.output += t.output || t.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (next === "<" && !utils.supportsLookbehinds()) {
              throw new Error("Node.js v10 or higher is required for regex lookbehinds");
            }
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && eos()) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const win32 = utils.isWindows(options);
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(win32);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source2 = create(match[1]);
            if (!source2) return;
            return source2 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source = create(output);
      if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
      }
      return source;
    };
    module2.exports = parse;
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/picomatch.js
var require_picomatch3 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/picomatch.js"(exports2, module2) {
    "use strict";
    var path47 = require("path");
    var scan = require_scan2();
    var parse = require_parse3();
    var utils = require_utils3();
    var constants = require_constants3();
    var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch7 = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch7(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix2 = utils.isWindows(options);
      const regex = isState ? picomatch7.compileRe(glob, options) : picomatch7.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch7(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch7.test(input, regex, options, { glob, posix: posix2 });
        const result = { glob, state, regex, posix: posix2, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result);
        }
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result);
          }
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result);
        }
        return returnObject ? result : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch7.test = (input, regex, options, { glob, posix: posix2 } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix2 ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch7.matchBase(input, regex, options, posix2);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch7.matchBase = (input, glob, options, posix2 = utils.isWindows(options)) => {
      const regex = glob instanceof RegExp ? glob : picomatch7.makeRe(glob, options);
      return regex.test(path47.basename(input));
    };
    picomatch7.isMatch = (str, patterns, options) => picomatch7(patterns, options)(str);
    picomatch7.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch7.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch7.scan = (input, options) => scan(input, options);
    picomatch7.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
      }
      const regex = picomatch7.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch7.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse(input, options);
      }
      return picomatch7.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch7.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch7.constants = constants;
    module2.exports = picomatch7;
  }
});

// node_modules/micromatch/node_modules/picomatch/index.js
var require_picomatch4 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/index.js"(exports2, module2) {
    "use strict";
    module2.exports = require_picomatch3();
  }
});

// node_modules/micromatch/index.js
var require_micromatch = __commonJS({
  "node_modules/micromatch/index.js"(exports2, module2) {
    "use strict";
    var util2 = require("util");
    var braces = require_braces();
    var picomatch7 = require_picomatch4();
    var utils = require_utils3();
    var isEmptyString = (v) => v === "" || v === "./";
    var hasBraces = (v) => {
      const index = v.indexOf("{");
      return index > -1 && v.indexOf("}", index) > -1;
    };
    var micromatch = (list, patterns, options) => {
      patterns = [].concat(patterns);
      list = [].concat(list);
      let omit = /* @__PURE__ */ new Set();
      let keep = /* @__PURE__ */ new Set();
      let items = /* @__PURE__ */ new Set();
      let negatives = 0;
      let onResult = (state) => {
        items.add(state.output);
        if (options && options.onResult) {
          options.onResult(state);
        }
      };
      for (let i = 0; i < patterns.length; i++) {
        let isMatch = picomatch7(String(patterns[i]), { ...options, onResult }, true);
        let negated = isMatch.state.negated || isMatch.state.negatedExtglob;
        if (negated) negatives++;
        for (let item of list) {
          let matched = isMatch(item, true);
          let match = negated ? !matched.isMatch : matched.isMatch;
          if (!match) continue;
          if (negated) {
            omit.add(matched.output);
          } else {
            omit.delete(matched.output);
            keep.add(matched.output);
          }
        }
      }
      let result = negatives === patterns.length ? [...items] : [...keep];
      let matches = result.filter((item) => !omit.has(item));
      if (options && matches.length === 0) {
        if (options.failglob === true) {
          throw new Error(`No matches found for "${patterns.join(", ")}"`);
        }
        if (options.nonull === true || options.nullglob === true) {
          return options.unescape ? patterns.map((p) => p.replace(/\\/g, "")) : patterns;
        }
      }
      return matches;
    };
    micromatch.match = micromatch;
    micromatch.matcher = (pattern, options) => picomatch7(pattern, options);
    micromatch.isMatch = (str, patterns, options) => picomatch7(patterns, options)(str);
    micromatch.any = micromatch.isMatch;
    micromatch.not = (list, patterns, options = {}) => {
      patterns = [].concat(patterns).map(String);
      let result = /* @__PURE__ */ new Set();
      let items = [];
      let onResult = (state) => {
        if (options.onResult) options.onResult(state);
        items.push(state.output);
      };
      let matches = new Set(micromatch(list, patterns, { ...options, onResult }));
      for (let item of items) {
        if (!matches.has(item)) {
          result.add(item);
        }
      }
      return [...result];
    };
    micromatch.contains = (str, pattern, options) => {
      if (typeof str !== "string") {
        throw new TypeError(`Expected a string: "${util2.inspect(str)}"`);
      }
      if (Array.isArray(pattern)) {
        return pattern.some((p) => micromatch.contains(str, p, options));
      }
      if (typeof pattern === "string") {
        if (isEmptyString(str) || isEmptyString(pattern)) {
          return false;
        }
        if (str.includes(pattern) || str.startsWith("./") && str.slice(2).includes(pattern)) {
          return true;
        }
      }
      return micromatch.isMatch(str, pattern, { ...options, contains: true });
    };
    micromatch.matchKeys = (obj, patterns, options) => {
      if (!utils.isObject(obj)) {
        throw new TypeError("Expected the first argument to be an object");
      }
      let keys = micromatch(Object.keys(obj), patterns, options);
      let res = {};
      for (let key of keys) res[key] = obj[key];
      return res;
    };
    micromatch.some = (list, patterns, options) => {
      let items = [].concat(list);
      for (let pattern of [].concat(patterns)) {
        let isMatch = picomatch7(String(pattern), options);
        if (items.some((item) => isMatch(item))) {
          return true;
        }
      }
      return false;
    };
    micromatch.every = (list, patterns, options) => {
      let items = [].concat(list);
      for (let pattern of [].concat(patterns)) {
        let isMatch = picomatch7(String(pattern), options);
        if (!items.every((item) => isMatch(item))) {
          return false;
        }
      }
      return true;
    };
    micromatch.all = (str, patterns, options) => {
      if (typeof str !== "string") {
        throw new TypeError(`Expected a string: "${util2.inspect(str)}"`);
      }
      return [].concat(patterns).every((p) => picomatch7(p, options)(str));
    };
    micromatch.capture = (glob, input, options) => {
      let posix2 = utils.isWindows(options);
      let regex = picomatch7.makeRe(String(glob), { ...options, capture: true });
      let match = regex.exec(posix2 ? utils.toPosixSlashes(input) : input);
      if (match) {
        return match.slice(1).map((v) => v === void 0 ? "" : v);
      }
    };
    micromatch.makeRe = (...args) => picomatch7.makeRe(...args);
    micromatch.scan = (...args) => picomatch7.scan(...args);
    micromatch.parse = (patterns, options) => {
      let res = [];
      for (let pattern of [].concat(patterns || [])) {
        for (let str of braces(String(pattern), options)) {
          res.push(picomatch7.parse(str, options));
        }
      }
      return res;
    };
    micromatch.braces = (pattern, options) => {
      if (typeof pattern !== "string") throw new TypeError("Expected a string");
      if (options && options.nobrace === true || !hasBraces(pattern)) {
        return [pattern];
      }
      return braces(pattern, options);
    };
    micromatch.braceExpand = (pattern, options) => {
      if (typeof pattern !== "string") throw new TypeError("Expected a string");
      return micromatch.braces(pattern, { ...options, expand: true });
    };
    micromatch.hasBraces = hasBraces;
    module2.exports = micromatch;
  }
});

// node_modules/fast-glob/out/utils/pattern.js
var require_pattern = __commonJS({
  "node_modules/fast-glob/out/utils/pattern.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isAbsolute = exports2.partitionAbsoluteAndRelative = exports2.removeDuplicateSlashes = exports2.matchAny = exports2.convertPatternsToRe = exports2.makeRe = exports2.getPatternParts = exports2.expandBraceExpansion = exports2.expandPatternsWithBraceExpansion = exports2.isAffectDepthOfReadingPattern = exports2.endsWithSlashGlobStar = exports2.hasGlobStar = exports2.getBaseDirectory = exports2.isPatternRelatedToParentDirectory = exports2.getPatternsOutsideCurrentDirectory = exports2.getPatternsInsideCurrentDirectory = exports2.getPositivePatterns = exports2.getNegativePatterns = exports2.isPositivePattern = exports2.isNegativePattern = exports2.convertToNegativePattern = exports2.convertToPositivePattern = exports2.isDynamicPattern = exports2.isStaticPattern = void 0;
    var path47 = require("path");
    var globParent = require_glob_parent();
    var micromatch = require_micromatch();
    var GLOBSTAR = "**";
    var ESCAPE_SYMBOL = "\\";
    var COMMON_GLOB_SYMBOLS_RE = /[*?]|^!/;
    var REGEX_CHARACTER_CLASS_SYMBOLS_RE = /\[[^[]*]/;
    var REGEX_GROUP_SYMBOLS_RE = /(?:^|[^!*+?@])\([^(]*\|[^|]*\)/;
    var GLOB_EXTENSION_SYMBOLS_RE = /[!*+?@]\([^(]*\)/;
    var BRACE_EXPANSION_SEPARATORS_RE = /,|\.\./;
    var DOUBLE_SLASH_RE = /(?!^)\/{2,}/g;
    function isStaticPattern(pattern, options = {}) {
      return !isDynamicPattern(pattern, options);
    }
    exports2.isStaticPattern = isStaticPattern;
    function isDynamicPattern(pattern, options = {}) {
      if (pattern === "") {
        return false;
      }
      if (options.caseSensitiveMatch === false || pattern.includes(ESCAPE_SYMBOL)) {
        return true;
      }
      if (COMMON_GLOB_SYMBOLS_RE.test(pattern) || REGEX_CHARACTER_CLASS_SYMBOLS_RE.test(pattern) || REGEX_GROUP_SYMBOLS_RE.test(pattern)) {
        return true;
      }
      if (options.extglob !== false && GLOB_EXTENSION_SYMBOLS_RE.test(pattern)) {
        return true;
      }
      if (options.braceExpansion !== false && hasBraceExpansion(pattern)) {
        return true;
      }
      return false;
    }
    exports2.isDynamicPattern = isDynamicPattern;
    function hasBraceExpansion(pattern) {
      const openingBraceIndex = pattern.indexOf("{");
      if (openingBraceIndex === -1) {
        return false;
      }
      const closingBraceIndex = pattern.indexOf("}", openingBraceIndex + 1);
      if (closingBraceIndex === -1) {
        return false;
      }
      const braceContent = pattern.slice(openingBraceIndex, closingBraceIndex);
      return BRACE_EXPANSION_SEPARATORS_RE.test(braceContent);
    }
    function convertToPositivePattern(pattern) {
      return isNegativePattern(pattern) ? pattern.slice(1) : pattern;
    }
    exports2.convertToPositivePattern = convertToPositivePattern;
    function convertToNegativePattern(pattern) {
      return "!" + pattern;
    }
    exports2.convertToNegativePattern = convertToNegativePattern;
    function isNegativePattern(pattern) {
      return pattern.startsWith("!") && pattern[1] !== "(";
    }
    exports2.isNegativePattern = isNegativePattern;
    function isPositivePattern(pattern) {
      return !isNegativePattern(pattern);
    }
    exports2.isPositivePattern = isPositivePattern;
    function getNegativePatterns(patterns) {
      return patterns.filter(isNegativePattern);
    }
    exports2.getNegativePatterns = getNegativePatterns;
    function getPositivePatterns(patterns) {
      return patterns.filter(isPositivePattern);
    }
    exports2.getPositivePatterns = getPositivePatterns;
    function getPatternsInsideCurrentDirectory(patterns) {
      return patterns.filter((pattern) => !isPatternRelatedToParentDirectory(pattern));
    }
    exports2.getPatternsInsideCurrentDirectory = getPatternsInsideCurrentDirectory;
    function getPatternsOutsideCurrentDirectory(patterns) {
      return patterns.filter(isPatternRelatedToParentDirectory);
    }
    exports2.getPatternsOutsideCurrentDirectory = getPatternsOutsideCurrentDirectory;
    function isPatternRelatedToParentDirectory(pattern) {
      return pattern.startsWith("..") || pattern.startsWith("./..");
    }
    exports2.isPatternRelatedToParentDirectory = isPatternRelatedToParentDirectory;
    function getBaseDirectory(pattern) {
      return globParent(pattern, { flipBackslashes: false });
    }
    exports2.getBaseDirectory = getBaseDirectory;
    function hasGlobStar(pattern) {
      return pattern.includes(GLOBSTAR);
    }
    exports2.hasGlobStar = hasGlobStar;
    function endsWithSlashGlobStar(pattern) {
      return pattern.endsWith("/" + GLOBSTAR);
    }
    exports2.endsWithSlashGlobStar = endsWithSlashGlobStar;
    function isAffectDepthOfReadingPattern(pattern) {
      const basename8 = path47.basename(pattern);
      return endsWithSlashGlobStar(pattern) || isStaticPattern(basename8);
    }
    exports2.isAffectDepthOfReadingPattern = isAffectDepthOfReadingPattern;
    function expandPatternsWithBraceExpansion(patterns) {
      return patterns.reduce((collection, pattern) => {
        return collection.concat(expandBraceExpansion(pattern));
      }, []);
    }
    exports2.expandPatternsWithBraceExpansion = expandPatternsWithBraceExpansion;
    function expandBraceExpansion(pattern) {
      const patterns = micromatch.braces(pattern, { expand: true, nodupes: true, keepEscaping: true });
      patterns.sort((a, b) => a.length - b.length);
      return patterns.filter((pattern2) => pattern2 !== "");
    }
    exports2.expandBraceExpansion = expandBraceExpansion;
    function getPatternParts(pattern, options) {
      let { parts } = micromatch.scan(pattern, Object.assign(Object.assign({}, options), { parts: true }));
      if (parts.length === 0) {
        parts = [pattern];
      }
      if (parts[0].startsWith("/")) {
        parts[0] = parts[0].slice(1);
        parts.unshift("");
      }
      return parts;
    }
    exports2.getPatternParts = getPatternParts;
    function makeRe(pattern, options) {
      return micromatch.makeRe(pattern, options);
    }
    exports2.makeRe = makeRe;
    function convertPatternsToRe(patterns, options) {
      return patterns.map((pattern) => makeRe(pattern, options));
    }
    exports2.convertPatternsToRe = convertPatternsToRe;
    function matchAny(entry, patternsRe) {
      return patternsRe.some((patternRe) => patternRe.test(entry));
    }
    exports2.matchAny = matchAny;
    function removeDuplicateSlashes(pattern) {
      return pattern.replace(DOUBLE_SLASH_RE, "/");
    }
    exports2.removeDuplicateSlashes = removeDuplicateSlashes;
    function partitionAbsoluteAndRelative(patterns) {
      const absolute = [];
      const relative12 = [];
      for (const pattern of patterns) {
        if (isAbsolute5(pattern)) {
          absolute.push(pattern);
        } else {
          relative12.push(pattern);
        }
      }
      return [absolute, relative12];
    }
    exports2.partitionAbsoluteAndRelative = partitionAbsoluteAndRelative;
    function isAbsolute5(pattern) {
      return path47.isAbsolute(pattern);
    }
    exports2.isAbsolute = isAbsolute5;
  }
});

// node_modules/merge2/index.js
var require_merge2 = __commonJS({
  "node_modules/merge2/index.js"(exports2, module2) {
    "use strict";
    var Stream = require("stream");
    var PassThrough = Stream.PassThrough;
    var slice = Array.prototype.slice;
    module2.exports = merge2;
    function merge2() {
      const streamsQueue = [];
      const args = slice.call(arguments);
      let merging = false;
      let options = args[args.length - 1];
      if (options && !Array.isArray(options) && options.pipe == null) {
        args.pop();
      } else {
        options = {};
      }
      const doEnd = options.end !== false;
      const doPipeError = options.pipeError === true;
      if (options.objectMode == null) {
        options.objectMode = true;
      }
      if (options.highWaterMark == null) {
        options.highWaterMark = 64 * 1024;
      }
      const mergedStream = PassThrough(options);
      function addStream() {
        for (let i = 0, len = arguments.length; i < len; i++) {
          streamsQueue.push(pauseStreams(arguments[i], options));
        }
        mergeStream();
        return this;
      }
      function mergeStream() {
        if (merging) {
          return;
        }
        merging = true;
        let streams = streamsQueue.shift();
        if (!streams) {
          process.nextTick(endStream);
          return;
        }
        if (!Array.isArray(streams)) {
          streams = [streams];
        }
        let pipesCount = streams.length + 1;
        function next() {
          if (--pipesCount > 0) {
            return;
          }
          merging = false;
          mergeStream();
        }
        function pipe(stream) {
          function onend() {
            stream.removeListener("merge2UnpipeEnd", onend);
            stream.removeListener("end", onend);
            if (doPipeError) {
              stream.removeListener("error", onerror);
            }
            next();
          }
          function onerror(err) {
            mergedStream.emit("error", err);
          }
          if (stream._readableState.endEmitted) {
            return next();
          }
          stream.on("merge2UnpipeEnd", onend);
          stream.on("end", onend);
          if (doPipeError) {
            stream.on("error", onerror);
          }
          stream.pipe(mergedStream, { end: false });
          stream.resume();
        }
        for (let i = 0; i < streams.length; i++) {
          pipe(streams[i]);
        }
        next();
      }
      function endStream() {
        merging = false;
        mergedStream.emit("queueDrain");
        if (doEnd) {
          mergedStream.end();
        }
      }
      mergedStream.setMaxListeners(0);
      mergedStream.add = addStream;
      mergedStream.on("unpipe", function(stream) {
        stream.emit("merge2UnpipeEnd");
      });
      if (args.length) {
        addStream.apply(null, args);
      }
      return mergedStream;
    }
    function pauseStreams(streams, options) {
      if (!Array.isArray(streams)) {
        if (!streams._readableState && streams.pipe) {
          streams = streams.pipe(PassThrough(options));
        }
        if (!streams._readableState || !streams.pause || !streams.pipe) {
          throw new Error("Only readable stream can be merged.");
        }
        streams.pause();
      } else {
        for (let i = 0, len = streams.length; i < len; i++) {
          streams[i] = pauseStreams(streams[i], options);
        }
      }
      return streams;
    }
  }
});

// node_modules/fast-glob/out/utils/stream.js
var require_stream = __commonJS({
  "node_modules/fast-glob/out/utils/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.merge = void 0;
    var merge2 = require_merge2();
    function merge(streams) {
      const mergedStream = merge2(streams);
      streams.forEach((stream) => {
        stream.once("error", (error) => mergedStream.emit("error", error));
      });
      mergedStream.once("close", () => propagateCloseEventToSources(streams));
      mergedStream.once("end", () => propagateCloseEventToSources(streams));
      return mergedStream;
    }
    exports2.merge = merge;
    function propagateCloseEventToSources(streams) {
      streams.forEach((stream) => stream.emit("close"));
    }
  }
});

// node_modules/fast-glob/out/utils/string.js
var require_string = __commonJS({
  "node_modules/fast-glob/out/utils/string.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isEmpty = exports2.isString = void 0;
    function isString(input) {
      return typeof input === "string";
    }
    exports2.isString = isString;
    function isEmpty(input) {
      return input === "";
    }
    exports2.isEmpty = isEmpty;
  }
});

// node_modules/fast-glob/out/utils/index.js
var require_utils4 = __commonJS({
  "node_modules/fast-glob/out/utils/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.string = exports2.stream = exports2.pattern = exports2.path = exports2.fs = exports2.errno = exports2.array = void 0;
    var array = require_array();
    exports2.array = array;
    var errno = require_errno();
    exports2.errno = errno;
    var fs50 = require_fs();
    exports2.fs = fs50;
    var path47 = require_path();
    exports2.path = path47;
    var pattern = require_pattern();
    exports2.pattern = pattern;
    var stream = require_stream();
    exports2.stream = stream;
    var string = require_string();
    exports2.string = string;
  }
});

// node_modules/fast-glob/out/managers/tasks.js
var require_tasks = __commonJS({
  "node_modules/fast-glob/out/managers/tasks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.convertPatternGroupToTask = exports2.convertPatternGroupsToTasks = exports2.groupPatternsByBaseDirectory = exports2.getNegativePatternsAsPositive = exports2.getPositivePatterns = exports2.convertPatternsToTasks = exports2.generate = void 0;
    var utils = require_utils4();
    function generate(input, settings) {
      const patterns = processPatterns(input, settings);
      const ignore = processPatterns(settings.ignore, settings);
      const positivePatterns = getPositivePatterns(patterns);
      const negativePatterns = getNegativePatternsAsPositive(patterns, ignore);
      const staticPatterns = positivePatterns.filter((pattern) => utils.pattern.isStaticPattern(pattern, settings));
      const dynamicPatterns = positivePatterns.filter((pattern) => utils.pattern.isDynamicPattern(pattern, settings));
      const staticTasks = convertPatternsToTasks(
        staticPatterns,
        negativePatterns,
        /* dynamic */
        false
      );
      const dynamicTasks = convertPatternsToTasks(
        dynamicPatterns,
        negativePatterns,
        /* dynamic */
        true
      );
      return staticTasks.concat(dynamicTasks);
    }
    exports2.generate = generate;
    function processPatterns(input, settings) {
      let patterns = input;
      if (settings.braceExpansion) {
        patterns = utils.pattern.expandPatternsWithBraceExpansion(patterns);
      }
      if (settings.baseNameMatch) {
        patterns = patterns.map((pattern) => pattern.includes("/") ? pattern : `**/${pattern}`);
      }
      return patterns.map((pattern) => utils.pattern.removeDuplicateSlashes(pattern));
    }
    function convertPatternsToTasks(positive, negative, dynamic) {
      const tasks = [];
      const patternsOutsideCurrentDirectory = utils.pattern.getPatternsOutsideCurrentDirectory(positive);
      const patternsInsideCurrentDirectory = utils.pattern.getPatternsInsideCurrentDirectory(positive);
      const outsideCurrentDirectoryGroup = groupPatternsByBaseDirectory(patternsOutsideCurrentDirectory);
      const insideCurrentDirectoryGroup = groupPatternsByBaseDirectory(patternsInsideCurrentDirectory);
      tasks.push(...convertPatternGroupsToTasks(outsideCurrentDirectoryGroup, negative, dynamic));
      if ("." in insideCurrentDirectoryGroup) {
        tasks.push(convertPatternGroupToTask(".", patternsInsideCurrentDirectory, negative, dynamic));
      } else {
        tasks.push(...convertPatternGroupsToTasks(insideCurrentDirectoryGroup, negative, dynamic));
      }
      return tasks;
    }
    exports2.convertPatternsToTasks = convertPatternsToTasks;
    function getPositivePatterns(patterns) {
      return utils.pattern.getPositivePatterns(patterns);
    }
    exports2.getPositivePatterns = getPositivePatterns;
    function getNegativePatternsAsPositive(patterns, ignore) {
      const negative = utils.pattern.getNegativePatterns(patterns).concat(ignore);
      const positive = negative.map(utils.pattern.convertToPositivePattern);
      return positive;
    }
    exports2.getNegativePatternsAsPositive = getNegativePatternsAsPositive;
    function groupPatternsByBaseDirectory(patterns) {
      const group = {};
      return patterns.reduce((collection, pattern) => {
        const base = utils.pattern.getBaseDirectory(pattern);
        if (base in collection) {
          collection[base].push(pattern);
        } else {
          collection[base] = [pattern];
        }
        return collection;
      }, group);
    }
    exports2.groupPatternsByBaseDirectory = groupPatternsByBaseDirectory;
    function convertPatternGroupsToTasks(positive, negative, dynamic) {
      return Object.keys(positive).map((base) => {
        return convertPatternGroupToTask(base, positive[base], negative, dynamic);
      });
    }
    exports2.convertPatternGroupsToTasks = convertPatternGroupsToTasks;
    function convertPatternGroupToTask(base, positive, negative, dynamic) {
      return {
        dynamic,
        positive,
        negative,
        base,
        patterns: [].concat(positive, negative.map(utils.pattern.convertToNegativePattern))
      };
    }
    exports2.convertPatternGroupToTask = convertPatternGroupToTask;
  }
});

// node_modules/@nodelib/fs.stat/out/providers/async.js
var require_async = __commonJS({
  "node_modules/@nodelib/fs.stat/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.read = void 0;
    function read(path47, settings, callback) {
      settings.fs.lstat(path47, (lstatError, lstat) => {
        if (lstatError !== null) {
          callFailureCallback(callback, lstatError);
          return;
        }
        if (!lstat.isSymbolicLink() || !settings.followSymbolicLink) {
          callSuccessCallback(callback, lstat);
          return;
        }
        settings.fs.stat(path47, (statError, stat) => {
          if (statError !== null) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              callFailureCallback(callback, statError);
              return;
            }
            callSuccessCallback(callback, lstat);
            return;
          }
          if (settings.markSymbolicLink) {
            stat.isSymbolicLink = () => true;
          }
          callSuccessCallback(callback, stat);
        });
      });
    }
    exports2.read = read;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, result) {
      callback(null, result);
    }
  }
});

// node_modules/@nodelib/fs.stat/out/providers/sync.js
var require_sync = __commonJS({
  "node_modules/@nodelib/fs.stat/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.read = void 0;
    function read(path47, settings) {
      const lstat = settings.fs.lstatSync(path47);
      if (!lstat.isSymbolicLink() || !settings.followSymbolicLink) {
        return lstat;
      }
      try {
        const stat = settings.fs.statSync(path47);
        if (settings.markSymbolicLink) {
          stat.isSymbolicLink = () => true;
        }
        return stat;
      } catch (error) {
        if (!settings.throwErrorOnBrokenSymbolicLink) {
          return lstat;
        }
        throw error;
      }
    }
    exports2.read = read;
  }
});

// node_modules/@nodelib/fs.stat/out/adapters/fs.js
var require_fs2 = __commonJS({
  "node_modules/@nodelib/fs.stat/out/adapters/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createFileSystemAdapter = exports2.FILE_SYSTEM_ADAPTER = void 0;
    var fs50 = require("fs");
    exports2.FILE_SYSTEM_ADAPTER = {
      lstat: fs50.lstat,
      stat: fs50.stat,
      lstatSync: fs50.lstatSync,
      statSync: fs50.statSync
    };
    function createFileSystemAdapter(fsMethods) {
      if (fsMethods === void 0) {
        return exports2.FILE_SYSTEM_ADAPTER;
      }
      return Object.assign(Object.assign({}, exports2.FILE_SYSTEM_ADAPTER), fsMethods);
    }
    exports2.createFileSystemAdapter = createFileSystemAdapter;
  }
});

// node_modules/@nodelib/fs.stat/out/settings.js
var require_settings = __commonJS({
  "node_modules/@nodelib/fs.stat/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fs50 = require_fs2();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.followSymbolicLink = this._getValue(this._options.followSymbolicLink, true);
        this.fs = fs50.createFileSystemAdapter(this._options.fs);
        this.markSymbolicLink = this._getValue(this._options.markSymbolicLink, false);
        this.throwErrorOnBrokenSymbolicLink = this._getValue(this._options.throwErrorOnBrokenSymbolicLink, true);
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/@nodelib/fs.stat/out/index.js
var require_out = __commonJS({
  "node_modules/@nodelib/fs.stat/out/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.statSync = exports2.stat = exports2.Settings = void 0;
    var async = require_async();
    var sync = require_sync();
    var settings_1 = require_settings();
    exports2.Settings = settings_1.default;
    function stat(path47, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        async.read(path47, getSettings(), optionsOrSettingsOrCallback);
        return;
      }
      async.read(path47, getSettings(optionsOrSettingsOrCallback), callback);
    }
    exports2.stat = stat;
    function statSync10(path47, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return sync.read(path47, settings);
    }
    exports2.statSync = statSync10;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default) {
        return settingsOrOptions;
      }
      return new settings_1.default(settingsOrOptions);
    }
  }
});

// node_modules/queue-microtask/index.js
var require_queue_microtask = __commonJS({
  "node_modules/queue-microtask/index.js"(exports2, module2) {
    var promise;
    module2.exports = typeof queueMicrotask === "function" ? queueMicrotask.bind(typeof window !== "undefined" ? window : global) : (cb) => (promise || (promise = Promise.resolve())).then(cb).catch((err) => setTimeout(() => {
      throw err;
    }, 0));
  }
});

// node_modules/run-parallel/index.js
var require_run_parallel = __commonJS({
  "node_modules/run-parallel/index.js"(exports2, module2) {
    module2.exports = runParallel;
    var queueMicrotask2 = require_queue_microtask();
    function runParallel(tasks, cb) {
      let results, pending, keys;
      let isSync = true;
      if (Array.isArray(tasks)) {
        results = [];
        pending = tasks.length;
      } else {
        keys = Object.keys(tasks);
        results = {};
        pending = keys.length;
      }
      function done(err) {
        function end() {
          if (cb) cb(err, results);
          cb = null;
        }
        if (isSync) queueMicrotask2(end);
        else end();
      }
      function each(i, err, result) {
        results[i] = result;
        if (--pending === 0 || err) {
          done(err);
        }
      }
      if (!pending) {
        done(null);
      } else if (keys) {
        keys.forEach(function(key) {
          tasks[key](function(err, result) {
            each(key, err, result);
          });
        });
      } else {
        tasks.forEach(function(task, i) {
          task(function(err, result) {
            each(i, err, result);
          });
        });
      }
      isSync = false;
    }
  }
});

// node_modules/@nodelib/fs.scandir/out/constants.js
var require_constants4 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.IS_SUPPORT_READDIR_WITH_FILE_TYPES = void 0;
    var NODE_PROCESS_VERSION_PARTS = process.versions.node.split(".");
    if (NODE_PROCESS_VERSION_PARTS[0] === void 0 || NODE_PROCESS_VERSION_PARTS[1] === void 0) {
      throw new Error(`Unexpected behavior. The 'process.versions.node' variable has invalid value: ${process.versions.node}`);
    }
    var MAJOR_VERSION = Number.parseInt(NODE_PROCESS_VERSION_PARTS[0], 10);
    var MINOR_VERSION = Number.parseInt(NODE_PROCESS_VERSION_PARTS[1], 10);
    var SUPPORTED_MAJOR_VERSION = 10;
    var SUPPORTED_MINOR_VERSION = 10;
    var IS_MATCHED_BY_MAJOR = MAJOR_VERSION > SUPPORTED_MAJOR_VERSION;
    var IS_MATCHED_BY_MAJOR_AND_MINOR = MAJOR_VERSION === SUPPORTED_MAJOR_VERSION && MINOR_VERSION >= SUPPORTED_MINOR_VERSION;
    exports2.IS_SUPPORT_READDIR_WITH_FILE_TYPES = IS_MATCHED_BY_MAJOR || IS_MATCHED_BY_MAJOR_AND_MINOR;
  }
});

// node_modules/@nodelib/fs.scandir/out/utils/fs.js
var require_fs3 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/utils/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDirentFromStats = void 0;
    var DirentFromStats = class {
      constructor(name, stats) {
        this.name = name;
        this.isBlockDevice = stats.isBlockDevice.bind(stats);
        this.isCharacterDevice = stats.isCharacterDevice.bind(stats);
        this.isDirectory = stats.isDirectory.bind(stats);
        this.isFIFO = stats.isFIFO.bind(stats);
        this.isFile = stats.isFile.bind(stats);
        this.isSocket = stats.isSocket.bind(stats);
        this.isSymbolicLink = stats.isSymbolicLink.bind(stats);
      }
    };
    function createDirentFromStats(name, stats) {
      return new DirentFromStats(name, stats);
    }
    exports2.createDirentFromStats = createDirentFromStats;
  }
});

// node_modules/@nodelib/fs.scandir/out/utils/index.js
var require_utils5 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/utils/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.fs = void 0;
    var fs50 = require_fs3();
    exports2.fs = fs50;
  }
});

// node_modules/@nodelib/fs.scandir/out/providers/common.js
var require_common = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/providers/common.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.joinPathSegments = void 0;
    function joinPathSegments(a, b, separator) {
      if (a.endsWith(separator)) {
        return a + b;
      }
      return a + separator + b;
    }
    exports2.joinPathSegments = joinPathSegments;
  }
});

// node_modules/@nodelib/fs.scandir/out/providers/async.js
var require_async2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.readdir = exports2.readdirWithFileTypes = exports2.read = void 0;
    var fsStat = require_out();
    var rpl = require_run_parallel();
    var constants_1 = require_constants4();
    var utils = require_utils5();
    var common = require_common();
    function read(directory, settings, callback) {
      if (!settings.stats && constants_1.IS_SUPPORT_READDIR_WITH_FILE_TYPES) {
        readdirWithFileTypes(directory, settings, callback);
        return;
      }
      readdir(directory, settings, callback);
    }
    exports2.read = read;
    function readdirWithFileTypes(directory, settings, callback) {
      settings.fs.readdir(directory, { withFileTypes: true }, (readdirError, dirents) => {
        if (readdirError !== null) {
          callFailureCallback(callback, readdirError);
          return;
        }
        const entries = dirents.map((dirent) => ({
          dirent,
          name: dirent.name,
          path: common.joinPathSegments(directory, dirent.name, settings.pathSegmentSeparator)
        }));
        if (!settings.followSymbolicLinks) {
          callSuccessCallback(callback, entries);
          return;
        }
        const tasks = entries.map((entry) => makeRplTaskEntry(entry, settings));
        rpl(tasks, (rplError, rplEntries) => {
          if (rplError !== null) {
            callFailureCallback(callback, rplError);
            return;
          }
          callSuccessCallback(callback, rplEntries);
        });
      });
    }
    exports2.readdirWithFileTypes = readdirWithFileTypes;
    function makeRplTaskEntry(entry, settings) {
      return (done) => {
        if (!entry.dirent.isSymbolicLink()) {
          done(null, entry);
          return;
        }
        settings.fs.stat(entry.path, (statError, stats) => {
          if (statError !== null) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              done(statError);
              return;
            }
            done(null, entry);
            return;
          }
          entry.dirent = utils.fs.createDirentFromStats(entry.name, stats);
          done(null, entry);
        });
      };
    }
    function readdir(directory, settings, callback) {
      settings.fs.readdir(directory, (readdirError, names) => {
        if (readdirError !== null) {
          callFailureCallback(callback, readdirError);
          return;
        }
        const tasks = names.map((name) => {
          const path47 = common.joinPathSegments(directory, name, settings.pathSegmentSeparator);
          return (done) => {
            fsStat.stat(path47, settings.fsStatSettings, (error, stats) => {
              if (error !== null) {
                done(error);
                return;
              }
              const entry = {
                name,
                path: path47,
                dirent: utils.fs.createDirentFromStats(name, stats)
              };
              if (settings.stats) {
                entry.stats = stats;
              }
              done(null, entry);
            });
          };
        });
        rpl(tasks, (rplError, entries) => {
          if (rplError !== null) {
            callFailureCallback(callback, rplError);
            return;
          }
          callSuccessCallback(callback, entries);
        });
      });
    }
    exports2.readdir = readdir;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, result) {
      callback(null, result);
    }
  }
});

// node_modules/@nodelib/fs.scandir/out/providers/sync.js
var require_sync2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.readdir = exports2.readdirWithFileTypes = exports2.read = void 0;
    var fsStat = require_out();
    var constants_1 = require_constants4();
    var utils = require_utils5();
    var common = require_common();
    function read(directory, settings) {
      if (!settings.stats && constants_1.IS_SUPPORT_READDIR_WITH_FILE_TYPES) {
        return readdirWithFileTypes(directory, settings);
      }
      return readdir(directory, settings);
    }
    exports2.read = read;
    function readdirWithFileTypes(directory, settings) {
      const dirents = settings.fs.readdirSync(directory, { withFileTypes: true });
      return dirents.map((dirent) => {
        const entry = {
          dirent,
          name: dirent.name,
          path: common.joinPathSegments(directory, dirent.name, settings.pathSegmentSeparator)
        };
        if (entry.dirent.isSymbolicLink() && settings.followSymbolicLinks) {
          try {
            const stats = settings.fs.statSync(entry.path);
            entry.dirent = utils.fs.createDirentFromStats(entry.name, stats);
          } catch (error) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              throw error;
            }
          }
        }
        return entry;
      });
    }
    exports2.readdirWithFileTypes = readdirWithFileTypes;
    function readdir(directory, settings) {
      const names = settings.fs.readdirSync(directory);
      return names.map((name) => {
        const entryPath = common.joinPathSegments(directory, name, settings.pathSegmentSeparator);
        const stats = fsStat.statSync(entryPath, settings.fsStatSettings);
        const entry = {
          name,
          path: entryPath,
          dirent: utils.fs.createDirentFromStats(name, stats)
        };
        if (settings.stats) {
          entry.stats = stats;
        }
        return entry;
      });
    }
    exports2.readdir = readdir;
  }
});

// node_modules/@nodelib/fs.scandir/out/adapters/fs.js
var require_fs4 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/adapters/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createFileSystemAdapter = exports2.FILE_SYSTEM_ADAPTER = void 0;
    var fs50 = require("fs");
    exports2.FILE_SYSTEM_ADAPTER = {
      lstat: fs50.lstat,
      stat: fs50.stat,
      lstatSync: fs50.lstatSync,
      statSync: fs50.statSync,
      readdir: fs50.readdir,
      readdirSync: fs50.readdirSync
    };
    function createFileSystemAdapter(fsMethods) {
      if (fsMethods === void 0) {
        return exports2.FILE_SYSTEM_ADAPTER;
      }
      return Object.assign(Object.assign({}, exports2.FILE_SYSTEM_ADAPTER), fsMethods);
    }
    exports2.createFileSystemAdapter = createFileSystemAdapter;
  }
});

// node_modules/@nodelib/fs.scandir/out/settings.js
var require_settings2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path47 = require("path");
    var fsStat = require_out();
    var fs50 = require_fs4();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.followSymbolicLinks = this._getValue(this._options.followSymbolicLinks, false);
        this.fs = fs50.createFileSystemAdapter(this._options.fs);
        this.pathSegmentSeparator = this._getValue(this._options.pathSegmentSeparator, path47.sep);
        this.stats = this._getValue(this._options.stats, false);
        this.throwErrorOnBrokenSymbolicLink = this._getValue(this._options.throwErrorOnBrokenSymbolicLink, true);
        this.fsStatSettings = new fsStat.Settings({
          followSymbolicLink: this.followSymbolicLinks,
          fs: this.fs,
          throwErrorOnBrokenSymbolicLink: this.throwErrorOnBrokenSymbolicLink
        });
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/@nodelib/fs.scandir/out/index.js
var require_out2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Settings = exports2.scandirSync = exports2.scandir = void 0;
    var async = require_async2();
    var sync = require_sync2();
    var settings_1 = require_settings2();
    exports2.Settings = settings_1.default;
    function scandir(path47, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        async.read(path47, getSettings(), optionsOrSettingsOrCallback);
        return;
      }
      async.read(path47, getSettings(optionsOrSettingsOrCallback), callback);
    }
    exports2.scandir = scandir;
    function scandirSync(path47, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return sync.read(path47, settings);
    }
    exports2.scandirSync = scandirSync;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default) {
        return settingsOrOptions;
      }
      return new settings_1.default(settingsOrOptions);
    }
  }
});

// node_modules/reusify/reusify.js
var require_reusify = __commonJS({
  "node_modules/reusify/reusify.js"(exports2, module2) {
    "use strict";
    function reusify(Constructor) {
      var head = new Constructor();
      var tail = head;
      function get() {
        var current = head;
        if (current.next) {
          head = current.next;
        } else {
          head = new Constructor();
          tail = head;
        }
        current.next = null;
        return current;
      }
      function release(obj) {
        tail.next = obj;
        tail = obj;
      }
      return {
        get,
        release
      };
    }
    module2.exports = reusify;
  }
});

// node_modules/fastq/queue.js
var require_queue = __commonJS({
  "node_modules/fastq/queue.js"(exports2, module2) {
    "use strict";
    var reusify = require_reusify();
    function fastqueue(context, worker, _concurrency) {
      if (typeof context === "function") {
        _concurrency = worker;
        worker = context;
        context = null;
      }
      if (!(_concurrency >= 1)) {
        throw new Error("fastqueue concurrency must be equal to or greater than 1");
      }
      var cache = reusify(Task);
      var queueHead = null;
      var queueTail = null;
      var _running = 0;
      var errorHandler = null;
      var self = {
        push,
        drain: noop,
        saturated: noop,
        pause,
        paused: false,
        get concurrency() {
          return _concurrency;
        },
        set concurrency(value) {
          if (!(value >= 1)) {
            throw new Error("fastqueue concurrency must be equal to or greater than 1");
          }
          _concurrency = value;
          if (self.paused) return;
          for (; queueHead && _running < _concurrency; ) {
            _running++;
            release();
          }
        },
        running,
        resume,
        idle,
        length,
        getQueue,
        unshift,
        empty: noop,
        kill,
        killAndDrain,
        error,
        abort
      };
      return self;
      function running() {
        return _running;
      }
      function pause() {
        self.paused = true;
      }
      function length() {
        var current = queueHead;
        var counter = 0;
        while (current) {
          current = current.next;
          counter++;
        }
        return counter;
      }
      function getQueue() {
        var current = queueHead;
        var tasks = [];
        while (current) {
          tasks.push(current.value);
          current = current.next;
        }
        return tasks;
      }
      function resume() {
        if (!self.paused) return;
        self.paused = false;
        if (queueHead === null) {
          _running++;
          release();
          return;
        }
        for (; queueHead && _running < _concurrency; ) {
          _running++;
          release();
        }
      }
      function idle() {
        return _running === 0 && self.length() === 0;
      }
      function push(value, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
          if (queueTail) {
            queueTail.next = current;
            queueTail = current;
          } else {
            queueHead = current;
            queueTail = current;
            self.saturated();
          }
        } else {
          _running++;
          worker.call(context, current.value, current.worked);
        }
      }
      function unshift(value, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
          if (queueHead) {
            current.next = queueHead;
            queueHead = current;
          } else {
            queueHead = current;
            queueTail = current;
            self.saturated();
          }
        } else {
          _running++;
          worker.call(context, current.value, current.worked);
        }
      }
      function release(holder) {
        if (holder) {
          cache.release(holder);
        }
        var next = queueHead;
        if (next && _running <= _concurrency) {
          if (!self.paused) {
            if (queueTail === queueHead) {
              queueTail = null;
            }
            queueHead = next.next;
            next.next = null;
            worker.call(context, next.value, next.worked);
            if (queueTail === null) {
              self.empty();
            }
          } else {
            _running--;
          }
        } else if (--_running === 0) {
          self.drain();
        }
      }
      function kill() {
        queueHead = null;
        queueTail = null;
        self.drain = noop;
      }
      function killAndDrain() {
        queueHead = null;
        queueTail = null;
        self.drain();
        self.drain = noop;
      }
      function abort() {
        var current = queueHead;
        queueHead = null;
        queueTail = null;
        while (current) {
          var next = current.next;
          var callback = current.callback;
          var errorHandler2 = current.errorHandler;
          var val = current.value;
          var context2 = current.context;
          current.value = null;
          current.callback = noop;
          current.errorHandler = null;
          current.next = null;
          if (errorHandler2) {
            errorHandler2(new Error("abort"), val);
          }
          callback.call(context2, new Error("abort"));
          cache.release(current);
          current = next;
        }
        self.drain = noop;
      }
      function error(handler) {
        errorHandler = handler;
      }
    }
    function noop() {
    }
    function Task() {
      this.value = null;
      this.callback = noop;
      this.next = null;
      this.release = noop;
      this.context = null;
      this.errorHandler = null;
      var self = this;
      this.worked = function worked(err, result) {
        var callback = self.callback;
        var errorHandler = self.errorHandler;
        var val = self.value;
        self.value = null;
        self.callback = noop;
        if (self.errorHandler) {
          errorHandler(err, val);
        }
        callback.call(self.context, err, result);
        self.release(self);
      };
    }
    function queueAsPromised(context, worker, _concurrency) {
      if (typeof context === "function") {
        _concurrency = worker;
        worker = context;
        context = null;
      }
      function asyncWrapper(arg, cb) {
        worker.call(this, arg).then(function(res) {
          cb(null, res);
        }, cb);
      }
      var queue = fastqueue(context, asyncWrapper, _concurrency);
      var pushCb = queue.push;
      var unshiftCb = queue.unshift;
      queue.push = push;
      queue.unshift = unshift;
      queue.drained = drained;
      return queue;
      function push(value) {
        var p = new Promise(function(resolve16, reject) {
          pushCb(value, function(err, result) {
            if (err) {
              reject(err);
              return;
            }
            resolve16(result);
          });
        });
        p.catch(noop);
        return p;
      }
      function unshift(value) {
        var p = new Promise(function(resolve16, reject) {
          unshiftCb(value, function(err, result) {
            if (err) {
              reject(err);
              return;
            }
            resolve16(result);
          });
        });
        p.catch(noop);
        return p;
      }
      function drained() {
        var p = new Promise(function(resolve16) {
          process.nextTick(function() {
            if (queue.idle()) {
              resolve16();
            } else {
              var previousDrain = queue.drain;
              queue.drain = function() {
                if (typeof previousDrain === "function") previousDrain();
                resolve16();
                queue.drain = previousDrain;
              };
            }
          });
        });
        return p;
      }
    }
    module2.exports = fastqueue;
    module2.exports.promise = queueAsPromised;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/common.js
var require_common2 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/common.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.joinPathSegments = exports2.replacePathSegmentSeparator = exports2.isAppliedFilter = exports2.isFatalError = void 0;
    function isFatalError(settings, error) {
      if (settings.errorFilter === null) {
        return true;
      }
      return !settings.errorFilter(error);
    }
    exports2.isFatalError = isFatalError;
    function isAppliedFilter(filter, value) {
      return filter === null || filter(value);
    }
    exports2.isAppliedFilter = isAppliedFilter;
    function replacePathSegmentSeparator(filepath, separator) {
      return filepath.split(/[/\\]/).join(separator);
    }
    exports2.replacePathSegmentSeparator = replacePathSegmentSeparator;
    function joinPathSegments(a, b, separator) {
      if (a === "") {
        return b;
      }
      if (a.endsWith(separator)) {
        return a + b;
      }
      return a + separator + b;
    }
    exports2.joinPathSegments = joinPathSegments;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/reader.js
var require_reader = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/reader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var common = require_common2();
    var Reader = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._root = common.replacePathSegmentSeparator(_root, _settings.pathSegmentSeparator);
      }
    };
    exports2.default = Reader;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/async.js
var require_async3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var events_1 = require("events");
    var fsScandir = require_out2();
    var fastq = require_queue();
    var common = require_common2();
    var reader_1 = require_reader();
    var AsyncReader = class extends reader_1.default {
      constructor(_root, _settings) {
        super(_root, _settings);
        this._settings = _settings;
        this._scandir = fsScandir.scandir;
        this._emitter = new events_1.EventEmitter();
        this._queue = fastq(this._worker.bind(this), this._settings.concurrency);
        this._isFatalError = false;
        this._isDestroyed = false;
        this._queue.drain = () => {
          if (!this._isFatalError) {
            this._emitter.emit("end");
          }
        };
      }
      read() {
        this._isFatalError = false;
        this._isDestroyed = false;
        setImmediate(() => {
          this._pushToQueue(this._root, this._settings.basePath);
        });
        return this._emitter;
      }
      get isDestroyed() {
        return this._isDestroyed;
      }
      destroy() {
        if (this._isDestroyed) {
          throw new Error("The reader is already destroyed");
        }
        this._isDestroyed = true;
        this._queue.killAndDrain();
      }
      onEntry(callback) {
        this._emitter.on("entry", callback);
      }
      onError(callback) {
        this._emitter.once("error", callback);
      }
      onEnd(callback) {
        this._emitter.once("end", callback);
      }
      _pushToQueue(directory, base) {
        const queueItem = { directory, base };
        this._queue.push(queueItem, (error) => {
          if (error !== null) {
            this._handleError(error);
          }
        });
      }
      _worker(item, done) {
        this._scandir(item.directory, this._settings.fsScandirSettings, (error, entries) => {
          if (error !== null) {
            done(error, void 0);
            return;
          }
          for (const entry of entries) {
            this._handleEntry(entry, item.base);
          }
          done(null, void 0);
        });
      }
      _handleError(error) {
        if (this._isDestroyed || !common.isFatalError(this._settings, error)) {
          return;
        }
        this._isFatalError = true;
        this._isDestroyed = true;
        this._emitter.emit("error", error);
      }
      _handleEntry(entry, base) {
        if (this._isDestroyed || this._isFatalError) {
          return;
        }
        const fullpath = entry.path;
        if (base !== void 0) {
          entry.path = common.joinPathSegments(base, entry.name, this._settings.pathSegmentSeparator);
        }
        if (common.isAppliedFilter(this._settings.entryFilter, entry)) {
          this._emitEntry(entry);
        }
        if (entry.dirent.isDirectory() && common.isAppliedFilter(this._settings.deepFilter, entry)) {
          this._pushToQueue(fullpath, base === void 0 ? void 0 : entry.path);
        }
      }
      _emitEntry(entry) {
        this._emitter.emit("entry", entry);
      }
    };
    exports2.default = AsyncReader;
  }
});

// node_modules/@nodelib/fs.walk/out/providers/async.js
var require_async4 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var async_1 = require_async3();
    var AsyncProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new async_1.default(this._root, this._settings);
        this._storage = [];
      }
      read(callback) {
        this._reader.onError((error) => {
          callFailureCallback(callback, error);
        });
        this._reader.onEntry((entry) => {
          this._storage.push(entry);
        });
        this._reader.onEnd(() => {
          callSuccessCallback(callback, this._storage);
        });
        this._reader.read();
      }
    };
    exports2.default = AsyncProvider;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, entries) {
      callback(null, entries);
    }
  }
});

// node_modules/@nodelib/fs.walk/out/providers/stream.js
var require_stream2 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/providers/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var stream_1 = require("stream");
    var async_1 = require_async3();
    var StreamProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new async_1.default(this._root, this._settings);
        this._stream = new stream_1.Readable({
          objectMode: true,
          read: () => {
          },
          destroy: () => {
            if (!this._reader.isDestroyed) {
              this._reader.destroy();
            }
          }
        });
      }
      read() {
        this._reader.onError((error) => {
          this._stream.emit("error", error);
        });
        this._reader.onEntry((entry) => {
          this._stream.push(entry);
        });
        this._reader.onEnd(() => {
          this._stream.push(null);
        });
        this._reader.read();
        return this._stream;
      }
    };
    exports2.default = StreamProvider;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/sync.js
var require_sync3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fsScandir = require_out2();
    var common = require_common2();
    var reader_1 = require_reader();
    var SyncReader = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._scandir = fsScandir.scandirSync;
        this._storage = [];
        this._queue = /* @__PURE__ */ new Set();
      }
      read() {
        this._pushToQueue(this._root, this._settings.basePath);
        this._handleQueue();
        return this._storage;
      }
      _pushToQueue(directory, base) {
        this._queue.add({ directory, base });
      }
      _handleQueue() {
        for (const item of this._queue.values()) {
          this._handleDirectory(item.directory, item.base);
        }
      }
      _handleDirectory(directory, base) {
        try {
          const entries = this._scandir(directory, this._settings.fsScandirSettings);
          for (const entry of entries) {
            this._handleEntry(entry, base);
          }
        } catch (error) {
          this._handleError(error);
        }
      }
      _handleError(error) {
        if (!common.isFatalError(this._settings, error)) {
          return;
        }
        throw error;
      }
      _handleEntry(entry, base) {
        const fullpath = entry.path;
        if (base !== void 0) {
          entry.path = common.joinPathSegments(base, entry.name, this._settings.pathSegmentSeparator);
        }
        if (common.isAppliedFilter(this._settings.entryFilter, entry)) {
          this._pushToStorage(entry);
        }
        if (entry.dirent.isDirectory() && common.isAppliedFilter(this._settings.deepFilter, entry)) {
          this._pushToQueue(fullpath, base === void 0 ? void 0 : entry.path);
        }
      }
      _pushToStorage(entry) {
        this._storage.push(entry);
      }
    };
    exports2.default = SyncReader;
  }
});

// node_modules/@nodelib/fs.walk/out/providers/sync.js
var require_sync4 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var sync_1 = require_sync3();
    var SyncProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new sync_1.default(this._root, this._settings);
      }
      read() {
        return this._reader.read();
      }
    };
    exports2.default = SyncProvider;
  }
});

// node_modules/@nodelib/fs.walk/out/settings.js
var require_settings3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path47 = require("path");
    var fsScandir = require_out2();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.basePath = this._getValue(this._options.basePath, void 0);
        this.concurrency = this._getValue(this._options.concurrency, Number.POSITIVE_INFINITY);
        this.deepFilter = this._getValue(this._options.deepFilter, null);
        this.entryFilter = this._getValue(this._options.entryFilter, null);
        this.errorFilter = this._getValue(this._options.errorFilter, null);
        this.pathSegmentSeparator = this._getValue(this._options.pathSegmentSeparator, path47.sep);
        this.fsScandirSettings = new fsScandir.Settings({
          followSymbolicLinks: this._options.followSymbolicLinks,
          fs: this._options.fs,
          pathSegmentSeparator: this._options.pathSegmentSeparator,
          stats: this._options.stats,
          throwErrorOnBrokenSymbolicLink: this._options.throwErrorOnBrokenSymbolicLink
        });
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/@nodelib/fs.walk/out/index.js
var require_out3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Settings = exports2.walkStream = exports2.walkSync = exports2.walk = void 0;
    var async_1 = require_async4();
    var stream_1 = require_stream2();
    var sync_1 = require_sync4();
    var settings_1 = require_settings3();
    exports2.Settings = settings_1.default;
    function walk2(directory, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        new async_1.default(directory, getSettings()).read(optionsOrSettingsOrCallback);
        return;
      }
      new async_1.default(directory, getSettings(optionsOrSettingsOrCallback)).read(callback);
    }
    exports2.walk = walk2;
    function walkSync(directory, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      const provider = new sync_1.default(directory, settings);
      return provider.read();
    }
    exports2.walkSync = walkSync;
    function walkStream(directory, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      const provider = new stream_1.default(directory, settings);
      return provider.read();
    }
    exports2.walkStream = walkStream;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default) {
        return settingsOrOptions;
      }
      return new settings_1.default(settingsOrOptions);
    }
  }
});

// node_modules/fast-glob/out/readers/reader.js
var require_reader2 = __commonJS({
  "node_modules/fast-glob/out/readers/reader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path47 = require("path");
    var fsStat = require_out();
    var utils = require_utils4();
    var Reader = class {
      constructor(_settings) {
        this._settings = _settings;
        this._fsStatSettings = new fsStat.Settings({
          followSymbolicLink: this._settings.followSymbolicLinks,
          fs: this._settings.fs,
          throwErrorOnBrokenSymbolicLink: this._settings.followSymbolicLinks
        });
      }
      _getFullEntryPath(filepath) {
        return path47.resolve(this._settings.cwd, filepath);
      }
      _makeEntry(stats, pattern) {
        const entry = {
          name: pattern,
          path: pattern,
          dirent: utils.fs.createDirentFromStats(pattern, stats)
        };
        if (this._settings.stats) {
          entry.stats = stats;
        }
        return entry;
      }
      _isFatalError(error) {
        return !utils.errno.isEnoentCodeError(error) && !this._settings.suppressErrors;
      }
    };
    exports2.default = Reader;
  }
});

// node_modules/fast-glob/out/readers/stream.js
var require_stream3 = __commonJS({
  "node_modules/fast-glob/out/readers/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var stream_1 = require("stream");
    var fsStat = require_out();
    var fsWalk = require_out3();
    var reader_1 = require_reader2();
    var ReaderStream = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkStream = fsWalk.walkStream;
        this._stat = fsStat.stat;
      }
      dynamic(root, options) {
        return this._walkStream(root, options);
      }
      static(patterns, options) {
        const filepaths = patterns.map(this._getFullEntryPath, this);
        const stream = new stream_1.PassThrough({ objectMode: true });
        stream._write = (index, _enc, done) => {
          return this._getEntry(filepaths[index], patterns[index], options).then((entry) => {
            if (entry !== null && options.entryFilter(entry)) {
              stream.push(entry);
            }
            if (index === filepaths.length - 1) {
              stream.end();
            }
            done();
          }).catch(done);
        };
        for (let i = 0; i < filepaths.length; i++) {
          stream.write(i);
        }
        return stream;
      }
      _getEntry(filepath, pattern, options) {
        return this._getStat(filepath).then((stats) => this._makeEntry(stats, pattern)).catch((error) => {
          if (options.errorFilter(error)) {
            return null;
          }
          throw error;
        });
      }
      _getStat(filepath) {
        return new Promise((resolve16, reject) => {
          this._stat(filepath, this._fsStatSettings, (error, stats) => {
            return error === null ? resolve16(stats) : reject(error);
          });
        });
      }
    };
    exports2.default = ReaderStream;
  }
});

// node_modules/fast-glob/out/readers/async.js
var require_async5 = __commonJS({
  "node_modules/fast-glob/out/readers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fsWalk = require_out3();
    var reader_1 = require_reader2();
    var stream_1 = require_stream3();
    var ReaderAsync = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkAsync = fsWalk.walk;
        this._readerStream = new stream_1.default(this._settings);
      }
      dynamic(root, options) {
        return new Promise((resolve16, reject) => {
          this._walkAsync(root, options, (error, entries) => {
            if (error === null) {
              resolve16(entries);
            } else {
              reject(error);
            }
          });
        });
      }
      async static(patterns, options) {
        const entries = [];
        const stream = this._readerStream.static(patterns, options);
        return new Promise((resolve16, reject) => {
          stream.once("error", reject);
          stream.on("data", (entry) => entries.push(entry));
          stream.once("end", () => resolve16(entries));
        });
      }
    };
    exports2.default = ReaderAsync;
  }
});

// node_modules/fast-glob/out/providers/matchers/matcher.js
var require_matcher = __commonJS({
  "node_modules/fast-glob/out/providers/matchers/matcher.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils4();
    var Matcher = class {
      constructor(_patterns, _settings, _micromatchOptions) {
        this._patterns = _patterns;
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
        this._storage = [];
        this._fillStorage();
      }
      _fillStorage() {
        for (const pattern of this._patterns) {
          const segments = this._getPatternSegments(pattern);
          const sections = this._splitSegmentsIntoSections(segments);
          this._storage.push({
            complete: sections.length <= 1,
            pattern,
            segments,
            sections
          });
        }
      }
      _getPatternSegments(pattern) {
        const parts = utils.pattern.getPatternParts(pattern, this._micromatchOptions);
        return parts.map((part) => {
          const dynamic = utils.pattern.isDynamicPattern(part, this._settings);
          if (!dynamic) {
            return {
              dynamic: false,
              pattern: part
            };
          }
          return {
            dynamic: true,
            pattern: part,
            patternRe: utils.pattern.makeRe(part, this._micromatchOptions)
          };
        });
      }
      _splitSegmentsIntoSections(segments) {
        return utils.array.splitWhen(segments, (segment) => segment.dynamic && utils.pattern.hasGlobStar(segment.pattern));
      }
    };
    exports2.default = Matcher;
  }
});

// node_modules/fast-glob/out/providers/matchers/partial.js
var require_partial = __commonJS({
  "node_modules/fast-glob/out/providers/matchers/partial.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var matcher_1 = require_matcher();
    var PartialMatcher = class extends matcher_1.default {
      match(filepath) {
        const parts = filepath.split("/");
        const levels = parts.length;
        const patterns = this._storage.filter((info) => !info.complete || info.segments.length > levels);
        for (const pattern of patterns) {
          const section = pattern.sections[0];
          if (!pattern.complete && levels > section.length) {
            return true;
          }
          const match = parts.every((part, index) => {
            const segment = pattern.segments[index];
            if (segment.dynamic && segment.patternRe.test(part)) {
              return true;
            }
            if (!segment.dynamic && segment.pattern === part) {
              return true;
            }
            return false;
          });
          if (match) {
            return true;
          }
        }
        return false;
      }
    };
    exports2.default = PartialMatcher;
  }
});

// node_modules/fast-glob/out/providers/filters/deep.js
var require_deep = __commonJS({
  "node_modules/fast-glob/out/providers/filters/deep.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils4();
    var partial_1 = require_partial();
    var DeepFilter = class {
      constructor(_settings, _micromatchOptions) {
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
      }
      getFilter(basePath, positive, negative) {
        const matcher = this._getMatcher(positive);
        const negativeRe = this._getNegativePatternsRe(negative);
        return (entry) => this._filter(basePath, entry, matcher, negativeRe);
      }
      _getMatcher(patterns) {
        return new partial_1.default(patterns, this._settings, this._micromatchOptions);
      }
      _getNegativePatternsRe(patterns) {
        const affectDepthOfReadingPatterns = patterns.filter(utils.pattern.isAffectDepthOfReadingPattern);
        return utils.pattern.convertPatternsToRe(affectDepthOfReadingPatterns, this._micromatchOptions);
      }
      _filter(basePath, entry, matcher, negativeRe) {
        if (this._isSkippedByDeep(basePath, entry.path)) {
          return false;
        }
        if (this._isSkippedSymbolicLink(entry)) {
          return false;
        }
        const filepath = utils.path.removeLeadingDotSegment(entry.path);
        if (this._isSkippedByPositivePatterns(filepath, matcher)) {
          return false;
        }
        return this._isSkippedByNegativePatterns(filepath, negativeRe);
      }
      _isSkippedByDeep(basePath, entryPath) {
        if (this._settings.deep === Infinity) {
          return false;
        }
        return this._getEntryLevel(basePath, entryPath) >= this._settings.deep;
      }
      _getEntryLevel(basePath, entryPath) {
        const entryPathDepth = entryPath.split("/").length;
        if (basePath === "") {
          return entryPathDepth;
        }
        const basePathDepth = basePath.split("/").length;
        return entryPathDepth - basePathDepth;
      }
      _isSkippedSymbolicLink(entry) {
        return !this._settings.followSymbolicLinks && entry.dirent.isSymbolicLink();
      }
      _isSkippedByPositivePatterns(entryPath, matcher) {
        return !this._settings.baseNameMatch && !matcher.match(entryPath);
      }
      _isSkippedByNegativePatterns(entryPath, patternsRe) {
        return !utils.pattern.matchAny(entryPath, patternsRe);
      }
    };
    exports2.default = DeepFilter;
  }
});

// node_modules/fast-glob/out/providers/filters/entry.js
var require_entry = __commonJS({
  "node_modules/fast-glob/out/providers/filters/entry.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils4();
    var EntryFilter = class {
      constructor(_settings, _micromatchOptions) {
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
        this.index = /* @__PURE__ */ new Map();
      }
      getFilter(positive, negative) {
        const [absoluteNegative, relativeNegative] = utils.pattern.partitionAbsoluteAndRelative(negative);
        const patterns = {
          positive: {
            all: utils.pattern.convertPatternsToRe(positive, this._micromatchOptions)
          },
          negative: {
            absolute: utils.pattern.convertPatternsToRe(absoluteNegative, Object.assign(Object.assign({}, this._micromatchOptions), { dot: true })),
            relative: utils.pattern.convertPatternsToRe(relativeNegative, Object.assign(Object.assign({}, this._micromatchOptions), { dot: true }))
          }
        };
        return (entry) => this._filter(entry, patterns);
      }
      _filter(entry, patterns) {
        const filepath = utils.path.removeLeadingDotSegment(entry.path);
        if (this._settings.unique && this._isDuplicateEntry(filepath)) {
          return false;
        }
        if (this._onlyFileFilter(entry) || this._onlyDirectoryFilter(entry)) {
          return false;
        }
        const isMatched = this._isMatchToPatternsSet(filepath, patterns, entry.dirent.isDirectory());
        if (this._settings.unique && isMatched) {
          this._createIndexRecord(filepath);
        }
        return isMatched;
      }
      _isDuplicateEntry(filepath) {
        return this.index.has(filepath);
      }
      _createIndexRecord(filepath) {
        this.index.set(filepath, void 0);
      }
      _onlyFileFilter(entry) {
        return this._settings.onlyFiles && !entry.dirent.isFile();
      }
      _onlyDirectoryFilter(entry) {
        return this._settings.onlyDirectories && !entry.dirent.isDirectory();
      }
      _isMatchToPatternsSet(filepath, patterns, isDirectory) {
        const isMatched = this._isMatchToPatterns(filepath, patterns.positive.all, isDirectory);
        if (!isMatched) {
          return false;
        }
        const isMatchedByRelativeNegative = this._isMatchToPatterns(filepath, patterns.negative.relative, isDirectory);
        if (isMatchedByRelativeNegative) {
          return false;
        }
        const isMatchedByAbsoluteNegative = this._isMatchToAbsoluteNegative(filepath, patterns.negative.absolute, isDirectory);
        if (isMatchedByAbsoluteNegative) {
          return false;
        }
        return true;
      }
      _isMatchToAbsoluteNegative(filepath, patternsRe, isDirectory) {
        if (patternsRe.length === 0) {
          return false;
        }
        const fullpath = utils.path.makeAbsolute(this._settings.cwd, filepath);
        return this._isMatchToPatterns(fullpath, patternsRe, isDirectory);
      }
      _isMatchToPatterns(filepath, patternsRe, isDirectory) {
        if (patternsRe.length === 0) {
          return false;
        }
        const isMatched = utils.pattern.matchAny(filepath, patternsRe);
        if (!isMatched && isDirectory) {
          return utils.pattern.matchAny(filepath + "/", patternsRe);
        }
        return isMatched;
      }
    };
    exports2.default = EntryFilter;
  }
});

// node_modules/fast-glob/out/providers/filters/error.js
var require_error2 = __commonJS({
  "node_modules/fast-glob/out/providers/filters/error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils4();
    var ErrorFilter = class {
      constructor(_settings) {
        this._settings = _settings;
      }
      getFilter() {
        return (error) => this._isNonFatalError(error);
      }
      _isNonFatalError(error) {
        return utils.errno.isEnoentCodeError(error) || this._settings.suppressErrors;
      }
    };
    exports2.default = ErrorFilter;
  }
});

// node_modules/fast-glob/out/providers/transformers/entry.js
var require_entry2 = __commonJS({
  "node_modules/fast-glob/out/providers/transformers/entry.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils4();
    var EntryTransformer = class {
      constructor(_settings) {
        this._settings = _settings;
      }
      getTransformer() {
        return (entry) => this._transform(entry);
      }
      _transform(entry) {
        let filepath = entry.path;
        if (this._settings.absolute) {
          filepath = utils.path.makeAbsolute(this._settings.cwd, filepath);
          filepath = utils.path.unixify(filepath);
        }
        if (this._settings.markDirectories && entry.dirent.isDirectory()) {
          filepath += "/";
        }
        if (!this._settings.objectMode) {
          return filepath;
        }
        return Object.assign(Object.assign({}, entry), { path: filepath });
      }
    };
    exports2.default = EntryTransformer;
  }
});

// node_modules/fast-glob/out/providers/provider.js
var require_provider = __commonJS({
  "node_modules/fast-glob/out/providers/provider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path47 = require("path");
    var deep_1 = require_deep();
    var entry_1 = require_entry();
    var error_1 = require_error2();
    var entry_2 = require_entry2();
    var Provider = class {
      constructor(_settings) {
        this._settings = _settings;
        this.errorFilter = new error_1.default(this._settings);
        this.entryFilter = new entry_1.default(this._settings, this._getMicromatchOptions());
        this.deepFilter = new deep_1.default(this._settings, this._getMicromatchOptions());
        this.entryTransformer = new entry_2.default(this._settings);
      }
      _getRootDirectory(task) {
        return path47.resolve(this._settings.cwd, task.base);
      }
      _getReaderOptions(task) {
        const basePath = task.base === "." ? "" : task.base;
        return {
          basePath,
          pathSegmentSeparator: "/",
          concurrency: this._settings.concurrency,
          deepFilter: this.deepFilter.getFilter(basePath, task.positive, task.negative),
          entryFilter: this.entryFilter.getFilter(task.positive, task.negative),
          errorFilter: this.errorFilter.getFilter(),
          followSymbolicLinks: this._settings.followSymbolicLinks,
          fs: this._settings.fs,
          stats: this._settings.stats,
          throwErrorOnBrokenSymbolicLink: this._settings.throwErrorOnBrokenSymbolicLink,
          transform: this.entryTransformer.getTransformer()
        };
      }
      _getMicromatchOptions() {
        return {
          dot: this._settings.dot,
          matchBase: this._settings.baseNameMatch,
          nobrace: !this._settings.braceExpansion,
          nocase: !this._settings.caseSensitiveMatch,
          noext: !this._settings.extglob,
          noglobstar: !this._settings.globstar,
          posix: true,
          strictSlashes: false
        };
      }
    };
    exports2.default = Provider;
  }
});

// node_modules/fast-glob/out/providers/async.js
var require_async6 = __commonJS({
  "node_modules/fast-glob/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var async_1 = require_async5();
    var provider_1 = require_provider();
    var ProviderAsync = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new async_1.default(this._settings);
      }
      async read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        const entries = await this.api(root, task, options);
        return entries.map((entry) => options.transform(entry));
      }
      api(root, task, options) {
        if (task.dynamic) {
          return this._reader.dynamic(root, options);
        }
        return this._reader.static(task.patterns, options);
      }
    };
    exports2.default = ProviderAsync;
  }
});

// node_modules/fast-glob/out/providers/stream.js
var require_stream4 = __commonJS({
  "node_modules/fast-glob/out/providers/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var stream_1 = require("stream");
    var stream_2 = require_stream3();
    var provider_1 = require_provider();
    var ProviderStream = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new stream_2.default(this._settings);
      }
      read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        const source = this.api(root, task, options);
        const destination = new stream_1.Readable({ objectMode: true, read: () => {
        } });
        source.once("error", (error) => destination.emit("error", error)).on("data", (entry) => destination.emit("data", options.transform(entry))).once("end", () => destination.emit("end"));
        destination.once("close", () => source.destroy());
        return destination;
      }
      api(root, task, options) {
        if (task.dynamic) {
          return this._reader.dynamic(root, options);
        }
        return this._reader.static(task.patterns, options);
      }
    };
    exports2.default = ProviderStream;
  }
});

// node_modules/fast-glob/out/readers/sync.js
var require_sync5 = __commonJS({
  "node_modules/fast-glob/out/readers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fsStat = require_out();
    var fsWalk = require_out3();
    var reader_1 = require_reader2();
    var ReaderSync = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkSync = fsWalk.walkSync;
        this._statSync = fsStat.statSync;
      }
      dynamic(root, options) {
        return this._walkSync(root, options);
      }
      static(patterns, options) {
        const entries = [];
        for (const pattern of patterns) {
          const filepath = this._getFullEntryPath(pattern);
          const entry = this._getEntry(filepath, pattern, options);
          if (entry === null || !options.entryFilter(entry)) {
            continue;
          }
          entries.push(entry);
        }
        return entries;
      }
      _getEntry(filepath, pattern, options) {
        try {
          const stats = this._getStat(filepath);
          return this._makeEntry(stats, pattern);
        } catch (error) {
          if (options.errorFilter(error)) {
            return null;
          }
          throw error;
        }
      }
      _getStat(filepath) {
        return this._statSync(filepath, this._fsStatSettings);
      }
    };
    exports2.default = ReaderSync;
  }
});

// node_modules/fast-glob/out/providers/sync.js
var require_sync6 = __commonJS({
  "node_modules/fast-glob/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var sync_1 = require_sync5();
    var provider_1 = require_provider();
    var ProviderSync = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new sync_1.default(this._settings);
      }
      read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        const entries = this.api(root, task, options);
        return entries.map(options.transform);
      }
      api(root, task, options) {
        if (task.dynamic) {
          return this._reader.dynamic(root, options);
        }
        return this._reader.static(task.patterns, options);
      }
    };
    exports2.default = ProviderSync;
  }
});

// node_modules/fast-glob/out/settings.js
var require_settings4 = __commonJS({
  "node_modules/fast-glob/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DEFAULT_FILE_SYSTEM_ADAPTER = void 0;
    var fs50 = require("fs");
    var os2 = require("os");
    var CPU_COUNT = Math.max(os2.cpus().length, 1);
    exports2.DEFAULT_FILE_SYSTEM_ADAPTER = {
      lstat: fs50.lstat,
      lstatSync: fs50.lstatSync,
      stat: fs50.stat,
      statSync: fs50.statSync,
      readdir: fs50.readdir,
      readdirSync: fs50.readdirSync
    };
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.absolute = this._getValue(this._options.absolute, false);
        this.baseNameMatch = this._getValue(this._options.baseNameMatch, false);
        this.braceExpansion = this._getValue(this._options.braceExpansion, true);
        this.caseSensitiveMatch = this._getValue(this._options.caseSensitiveMatch, true);
        this.concurrency = this._getValue(this._options.concurrency, CPU_COUNT);
        this.cwd = this._getValue(this._options.cwd, process.cwd());
        this.deep = this._getValue(this._options.deep, Infinity);
        this.dot = this._getValue(this._options.dot, false);
        this.extglob = this._getValue(this._options.extglob, true);
        this.followSymbolicLinks = this._getValue(this._options.followSymbolicLinks, true);
        this.fs = this._getFileSystemMethods(this._options.fs);
        this.globstar = this._getValue(this._options.globstar, true);
        this.ignore = this._getValue(this._options.ignore, []);
        this.markDirectories = this._getValue(this._options.markDirectories, false);
        this.objectMode = this._getValue(this._options.objectMode, false);
        this.onlyDirectories = this._getValue(this._options.onlyDirectories, false);
        this.onlyFiles = this._getValue(this._options.onlyFiles, true);
        this.stats = this._getValue(this._options.stats, false);
        this.suppressErrors = this._getValue(this._options.suppressErrors, false);
        this.throwErrorOnBrokenSymbolicLink = this._getValue(this._options.throwErrorOnBrokenSymbolicLink, false);
        this.unique = this._getValue(this._options.unique, true);
        if (this.onlyDirectories) {
          this.onlyFiles = false;
        }
        if (this.stats) {
          this.objectMode = true;
        }
        this.ignore = [].concat(this.ignore);
      }
      _getValue(option, value) {
        return option === void 0 ? value : option;
      }
      _getFileSystemMethods(methods = {}) {
        return Object.assign(Object.assign({}, exports2.DEFAULT_FILE_SYSTEM_ADAPTER), methods);
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/fast-glob/out/index.js
var require_out4 = __commonJS({
  "node_modules/fast-glob/out/index.js"(exports2, module2) {
    "use strict";
    var taskManager = require_tasks();
    var async_1 = require_async6();
    var stream_1 = require_stream4();
    var sync_1 = require_sync6();
    var settings_1 = require_settings4();
    var utils = require_utils4();
    async function FastGlob(source, options) {
      assertPatternsInput(source);
      const works = getWorks(source, async_1.default, options);
      const result = await Promise.all(works);
      return utils.array.flatten(result);
    }
    (function(FastGlob2) {
      FastGlob2.glob = FastGlob2;
      FastGlob2.globSync = sync;
      FastGlob2.globStream = stream;
      FastGlob2.async = FastGlob2;
      function sync(source, options) {
        assertPatternsInput(source);
        const works = getWorks(source, sync_1.default, options);
        return utils.array.flatten(works);
      }
      FastGlob2.sync = sync;
      function stream(source, options) {
        assertPatternsInput(source);
        const works = getWorks(source, stream_1.default, options);
        return utils.stream.merge(works);
      }
      FastGlob2.stream = stream;
      function generateTasks(source, options) {
        assertPatternsInput(source);
        const patterns = [].concat(source);
        const settings = new settings_1.default(options);
        return taskManager.generate(patterns, settings);
      }
      FastGlob2.generateTasks = generateTasks;
      function isDynamicPattern(source, options) {
        assertPatternsInput(source);
        const settings = new settings_1.default(options);
        return utils.pattern.isDynamicPattern(source, settings);
      }
      FastGlob2.isDynamicPattern = isDynamicPattern;
      function escapePath(source) {
        assertPatternsInput(source);
        return utils.path.escape(source);
      }
      FastGlob2.escapePath = escapePath;
      function convertPathToPattern(source) {
        assertPatternsInput(source);
        return utils.path.convertPathToPattern(source);
      }
      FastGlob2.convertPathToPattern = convertPathToPattern;
      let posix2;
      (function(posix3) {
        function escapePath2(source) {
          assertPatternsInput(source);
          return utils.path.escapePosixPath(source);
        }
        posix3.escapePath = escapePath2;
        function convertPathToPattern2(source) {
          assertPatternsInput(source);
          return utils.path.convertPosixPathToPattern(source);
        }
        posix3.convertPathToPattern = convertPathToPattern2;
      })(posix2 = FastGlob2.posix || (FastGlob2.posix = {}));
      let win32;
      (function(win322) {
        function escapePath2(source) {
          assertPatternsInput(source);
          return utils.path.escapeWindowsPath(source);
        }
        win322.escapePath = escapePath2;
        function convertPathToPattern2(source) {
          assertPatternsInput(source);
          return utils.path.convertWindowsPathToPattern(source);
        }
        win322.convertPathToPattern = convertPathToPattern2;
      })(win32 = FastGlob2.win32 || (FastGlob2.win32 = {}));
    })(FastGlob || (FastGlob = {}));
    function getWorks(source, _Provider, options) {
      const patterns = [].concat(source);
      const settings = new settings_1.default(options);
      const tasks = taskManager.generate(patterns, settings);
      const provider = new _Provider(settings);
      return tasks.map(provider.read, provider);
    }
    function assertPatternsInput(input) {
      const source = [].concat(input);
      const isValidSource = source.every((item) => utils.string.isString(item) && !utils.string.isEmpty(item));
      if (!isValidSource) {
        throw new TypeError("Patterns must be a string (non empty) or an array of strings");
      }
    }
    module2.exports = FastGlob;
  }
});

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// src/cli.ts
var path46 = __toESM(require("node:path"), 1);
var fs49 = __toESM(require("node:fs"), 1);

// src/kit/init.ts
var fs9 = __toESM(require("node:fs"), 1);
var path10 = __toESM(require("node:path"), 1);
var import_node_child_process2 = require("node:child_process");

// src/kit/template-utils.ts
var fs = __toESM(require("node:fs"), 1);
var path2 = __toESM(require("node:path"), 1);

// src/core/module-dir.ts
var path = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");
function moduleDir(importMetaUrl) {
  if (typeof __dirname !== "undefined") return __dirname;
  return path.dirname((0, import_node_url.fileURLToPath)(importMetaUrl));
}

// src/kit/template-utils.ts
var import_meta = {};
function templatesDir() {
  return path2.join(moduleDir(import_meta.url), "..", "templates");
}
function readTemplate(name) {
  return fs.readFileSync(path2.join(templatesDir(), name), "utf-8");
}
function renderTemplate(content, vars) {
  let out = content;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}
function todayISO() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}

// src/core/stack-detect.ts
var fs2 = __toESM(require("node:fs"), 1);
var path3 = __toESM(require("node:path"), 1);
function detectStack(targetDir) {
  const exists = (p) => fs2.existsSync(path3.join(targetDir, p));
  if (exists("package.json")) {
    let scripts = {};
    try {
      const pkg = JSON.parse(fs2.readFileSync(path3.join(targetDir, "package.json"), "utf-8"));
      scripts = pkg.scripts ?? {};
    } catch {
    }
    const pm = exists("pnpm-lock.yaml") ? "pnpm" : exists("yarn.lock") ? "yarn" : "npm";
    const install = pm === "npm" ? "npm install" : `${pm} install`;
    const verify = scripts.test ? `${pm} test` : scripts.check ? `${pm} run check` : `${pm} test`;
    const start = scripts.dev ? `${pm} run dev` : scripts.start ? `${pm} start` : `${pm} run dev`;
    return { install, verify, start, kind: "node" };
  }
  if (exists("pyproject.toml")) {
    return { install: "uv sync", verify: "uv run pytest", start: "uv run python -m app", kind: "python-pyproject" };
  }
  if (exists("requirements.txt")) {
    return { install: "pip install -r requirements.txt", verify: "pytest", start: "python main.py", kind: "python-requirements" };
  }
  if (exists("Cargo.toml")) {
    return { install: "cargo build", verify: "cargo test", start: "cargo run", kind: "rust" };
  }
  if (exists("go.mod")) {
    return { install: "go mod download", verify: "go test ./...", start: "go run .", kind: "go" };
  }
  return { install: "echo 'set INSTALL_CMD'", verify: "echo 'set VERIFY_CMD'", start: "echo 'set START_CMD'", kind: "unknown" };
}

// src/core/repo-score.ts
var fs4 = __toESM(require("node:fs"), 1);
var path5 = __toESM(require("node:path"), 1);

// src/core/paths.ts
var fs3 = __toESM(require("node:fs"), 1);
var path4 = __toESM(require("node:path"), 1);

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue2) {
      return issue2.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue2 of error.issues) {
        if (issue2.code === "invalid_union") {
          issue2.unionErrors.map(processError);
        } else if (issue2.code === "invalid_return_type") {
          processError(issue2.returnTypeError);
        } else if (issue2.code === "invalid_arguments") {
          processError(issue2.argumentsError);
        } else if (issue2.path.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue2.path.length) {
            const el = issue2.path[i];
            const terminal = i === issue2.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue2) => issue2.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue2, _ctx) => {
  let message;
  switch (issue2.code) {
    case ZodIssueCode.invalid_type:
      if (issue2.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue2.expected}, received ${issue2.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue2.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue2.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue2.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue2.options)}, received '${issue2.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue2.validation === "object") {
        if ("includes" in issue2.validation) {
          message = `Invalid input: must include "${issue2.validation.includes}"`;
          if (typeof issue2.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue2.validation.position}`;
          }
        } else if ("startsWith" in issue2.validation) {
          message = `Invalid input: must start with "${issue2.validation.startsWith}"`;
        } else if ("endsWith" in issue2.validation) {
          message = `Invalid input: must end with "${issue2.validation.endsWith}"`;
        } else {
          util.assertNever(issue2.validation);
        }
      } else if (issue2.validation !== "regex") {
        message = `Invalid ${issue2.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue2.type === "array")
        message = `Array must contain ${issue2.exact ? "exactly" : issue2.inclusive ? `at least` : `more than`} ${issue2.minimum} element(s)`;
      else if (issue2.type === "string")
        message = `String must contain ${issue2.exact ? "exactly" : issue2.inclusive ? `at least` : `over`} ${issue2.minimum} character(s)`;
      else if (issue2.type === "number")
        message = `Number must be ${issue2.exact ? `exactly equal to ` : issue2.inclusive ? `greater than or equal to ` : `greater than `}${issue2.minimum}`;
      else if (issue2.type === "bigint")
        message = `Number must be ${issue2.exact ? `exactly equal to ` : issue2.inclusive ? `greater than or equal to ` : `greater than `}${issue2.minimum}`;
      else if (issue2.type === "date")
        message = `Date must be ${issue2.exact ? `exactly equal to ` : issue2.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue2.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue2.type === "array")
        message = `Array must contain ${issue2.exact ? `exactly` : issue2.inclusive ? `at most` : `less than`} ${issue2.maximum} element(s)`;
      else if (issue2.type === "string")
        message = `String must contain ${issue2.exact ? `exactly` : issue2.inclusive ? `at most` : `under`} ${issue2.maximum} character(s)`;
      else if (issue2.type === "number")
        message = `Number must be ${issue2.exact ? `exactly` : issue2.inclusive ? `less than or equal to` : `less than`} ${issue2.maximum}`;
      else if (issue2.type === "bigint")
        message = `BigInt must be ${issue2.exact ? `exactly` : issue2.inclusive ? `less than or equal to` : `less than`} ${issue2.maximum}`;
      else if (issue2.type === "date")
        message = `Date must be ${issue2.exact ? `exactly` : issue2.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue2.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue2.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue2);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path47, errorMaps, issueData } = params;
  const fullPath = [...path47, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue2 = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue2);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path47, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path47;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step2) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step2.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step2.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue2, ctx) => {
          const defaultError = this._def.errorMap?.(issue2, ctx).message ?? ctx.defaultError;
          if (issue2.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;

// src/core/paths.ts
var KitConfigError = class extends Error {
};
var KitRoute = external_exports.object({
  scope: external_exports.string().min(1),
  skill: external_exports.string().min(1),
  agents: external_exports.array(external_exports.string()).optional()
});
var containedRelativeDir = external_exports.string().min(1).refine((p) => !path4.isAbsolute(p), { message: "must be a relative path" }).refine((p) => !path4.normalize(p).split(/[\\/]/).includes(".."), {
  message: "must not escape the project directory with '..'"
});
var KitCommandsSchema = external_exports.object({
  install: external_exports.string().optional(),
  verify: external_exports.string().optional(),
  start: external_exports.string().optional(),
  /** A cheap baseline/smoke command — "does the project still start" — distinct from the full
   *  `verify` command, which may be slow enough that running it on every Stop is undesirable. */
  check: external_exports.string().optional()
}).default({});
var DebugCodeGateSchema = external_exports.object({
  mode: external_exports.enum(["warn", "block"]).default("warn"),
  paths: external_exports.array(external_exports.string()).default([])
}).default({});
var KitConfigSchema = external_exports.object({
  stateDir: containedRelativeDir.default(".claude/state"),
  issuesDir: containedRelativeDir.default(".claude/issues"),
  // Strict enum, deliberately. The close gate compared only against the literal "review", so any
  // other value — including a typo like "reveiw" — silently disabled the human-close requirement.
  // Fail-open on the one setting the kit's whole safety story rests on.
  autonomy: external_exports.enum(["review", "commit", "full"]).default("review"),
  maxAttempts: external_exports.number().int().positive().max(100).default(3),
  routes: external_exports.array(KitRoute).default([]),
  /** How the Stop hook reacts to a failing clean-state check. */
  stopGate: external_exports.enum(["block", "warn", "off"]).default("warn"),
  /** How `hx feature start` reacts when Verified Completion Rate (VCR) is below 100% — i.e. a
   *  blocked feature exists with no resolution recorded. "warn" (default) prints the gap and
   *  proceeds; "block" refuses to start a new feature until it's resolved (Lecture 7). */
  vcrGate: external_exports.enum(["warn", "block"]).default("warn"),
  /** Wall-clock cap for any single verification command, in milliseconds. */
  verifyTimeoutMs: external_exports.number().int().positive().default(6e5),
  /** (verify-004) Minimum length, in characters, of a `hx verify --attest` note. Undefined (the
   *  default) means "off" — the ladder only prints the "thin attestation" warning below 40 chars
   *  but still proceeds. Set > 0 to make a too-short note a hard refusal (ERROR/WHY/FIX, before
   *  the ladder runs, no status change) instead of just a warning — FIELD-NOTES-shreedurga.md:
   *  "checked in browser" passed as an attestation even though CLAUDE.md asked for "what was
   *  observed, with numbers". */
  attestMinChars: external_exports.number().int().nonnegative().optional(),
  commands: KitCommandsSchema,
  debugCodeGate: DebugCodeGateSchema,
  /** Whether a diff that deletes test files or lowers the it()/test() count in a changed test
   *  file fails the exit checklist ("block") or only warns ("warn", default). */
  testGuard: external_exports.enum(["warn", "block"]).default("warn"),
  /** Extra globs (on top of the built-in defaults — .env*, .claude/settings*.json,
   *  .claude/bin/**, .claude/hx.config.json, docs/generated/**) the PreToolUse hook denies
   *  Edit/Write/Bash/PowerShell access to. */
  protectedPaths: external_exports.array(external_exports.string()).default([]),
  /** Globs exempted from protectedPaths — e.g. ".env.example" should stay editable even though
   *  ".env*" is protected. */
  allowEdit: external_exports.array(external_exports.string()).default([]),
  /** Extra regex patterns (on top of the built-ins — rm -rf, git push --force, git reset --hard,
   *  git checkout -- ., git clean -f) the PreToolUse hook denies in a Bash/PowerShell command. */
  dangerousCommands: external_exports.array(external_exports.string()).default([]),
  /** Sprint contract "Exclusions" (Lecture 11) — globs that are always out of scope for every
   *  feature/issue's contract, on top of what other active work already declares. */
  handsOff: external_exports.array(external_exports.string()).default([]),
  /** Lecture 10 / the layered-domain-architecture SOP: an ordered list of layers, each a glob
   *  over the files that belong to it. Order matters — the built-in layer-order rule
   *  (core/rules.ts) flags a file importing from a LATER layer than its own (e.g. Types
   *  importing from UI) as a violation. Empty by default: the rule is a no-op until a project
   *  configures its layers. */
  architecture: external_exports.object({
    layers: external_exports.array(external_exports.object({ name: external_exports.string().min(1), glob: external_exports.string().min(1) })).default([])
  }).default({}),
  /** Phase 7's no-console-outside-logger rule: extra globs (on top of the built-in `**\/logger.*`
   *  / `**\/logging/**` heuristic) treated as designated logging modules, so a real console.*
   *  call there is not a violation. */
  logging: external_exports.object({
    allowedFiles: external_exports.array(external_exports.string()).default([])
  }).default({}),
  /** Phase 10: SessionStart reminds when `hx cleanup` hasn't run in this many days. */
  cleanupEveryDays: external_exports.number().int().positive().default(7),
  /** Phase 10: SessionStart reminds when `hx ablate` hasn't run in this many days. */
  simplifyEveryDays: external_exports.number().int().positive().default(30),
  /** A3.4: overrides instruction-lint.ts's six built-in prompt-calibration.md "Keep In The Root
   *  File" sections with a project-specific list. Full replacement, not a merge, when given — a
   *  project with a genuinely different persistence/operating model needs to be able to drop a
   *  built-in requirement that no longer fits it, not just layer its own on top. `pattern` is a
   *  regex source string (not a RegExp — this is JSON), matched case-insensitively against the
   *  whole instruction file. Undefined (the default) keeps the six built-ins unchanged. */
  instructionSections: external_exports.array(external_exports.object({ name: external_exports.string().min(1), pattern: external_exports.string().min(1) })).optional()
});
var DEFAULT_KIT_CONFIG = KitConfigSchema.parse({});
function kitConfigPath(root) {
  return path4.join(root, ".claude", "hx.config.json");
}
function loadKitConfig(root) {
  const p = kitConfigPath(root);
  if (!fs3.existsSync(p)) return null;
  let raw;
  try {
    raw = JSON.parse(fs3.readFileSync(p, "utf-8"));
  } catch (err) {
    throw new KitConfigError(`${p} is not valid JSON: ${err.message}`);
  }
  const parsed = KitConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new KitConfigError(
      `${p} is not a valid hx kit config:
${detail}
Fix the file, or delete it to fall back to the root layout.`
    );
  }
  return parsed.data;
}
function resolveProjectPaths(root) {
  const resolved = path4.resolve(root);
  const kitConfig = loadKitConfig(resolved);
  if (kitConfig) {
    const stateDir = path4.join(resolved, kitConfig.stateDir);
    return {
      root: resolved,
      layout: "kit",
      featureListPath: path4.join(stateDir, "feature_list.json"),
      progressPath: path4.join(stateDir, "progress.md"),
      handoffPath: path4.join(stateDir, "handoff.md"),
      lessonsPath: path4.join(stateDir, "lessons.md"),
      decisionsPath: path4.join(stateDir, "decisions.md"),
      qualityDocPath: path4.join(stateDir, "quality.md"),
      hxDir: stateDir,
      worktreesDir: path4.join(resolved, ".hx-worktrees"),
      issuesDir: path4.join(resolved, kitConfig.issuesDir),
      kitConfig
    };
  }
  return {
    root: resolved,
    layout: "root",
    featureListPath: path4.join(resolved, "feature_list.json"),
    progressPath: path4.join(resolved, "claude-progress.md"),
    handoffPath: path4.join(resolved, "session-handoff.md"),
    lessonsPath: path4.join(resolved, "LESSONS.md"),
    decisionsPath: path4.join(resolved, "docs", "DECISIONS.md"),
    qualityDocPath: path4.join(resolved, "docs", "QUALITY_SCORE.md"),
    hxDir: path4.join(resolved, ".hx"),
    worktreesDir: path4.join(resolved, ".hx-worktrees"),
    issuesDir: path4.join(resolved, ".hx-issues"),
    // unused in root layout until issues opt in
    kitConfig: null
  };
}
function ensureWorktreesGitignored(root) {
  const gitignorePath = path4.join(root, ".gitignore");
  const existing = fs3.existsSync(gitignorePath) ? fs3.readFileSync(gitignorePath, "utf-8") : "";
  const alreadyIgnored = existing.split("\n").some((l) => ["/.hx-worktrees/", ".hx-worktrees/", ".hx-worktrees"].includes(l.trim()));
  if (alreadyIgnored) return;
  const updated = existing.length > 0 && !existing.endsWith("\n") ? existing + "\n.hx-worktrees/\n" : existing + ".hx-worktrees/\n";
  fs3.writeFileSync(gitignorePath, updated, "utf-8");
}

// src/core/repo-score.ts
var CHECK_DEFS = [
  {
    name: "AGENTS.md / CLAUDE.md",
    description: "Agent-readable instruction file at repo root",
    maxPoints: 15,
    candidates: ["AGENTS.md", "CLAUDE.md", path5.join(".claude", "CLAUDE.md")]
  },
  {
    name: "Documentation directory",
    description: "Dedicated docs/ or documentation/ directory",
    maxPoints: 10,
    candidates: ["docs", "documentation", "doc"],
    isDir: true
  },
  {
    name: "Architecture documentation",
    description: "Files describing system architecture",
    maxPoints: 15,
    candidates: ["ARCHITECTURE.md", "architecture.md", path5.join("docs", "ARCHITECTURE.md"), "DESIGN.md", "design.md"]
  },
  {
    name: "Feature tracking",
    description: "Feature list or task tracking file",
    maxPoints: 15,
    candidates: ["feature_list.json", "features.md", "FEATURES.md", path5.join("docs", "features.md"), "tasks.json", "TODO.md"]
  },
  {
    name: "Handoff / session continuity",
    description: "Files for multi-session continuity",
    maxPoints: 15,
    // course-issue #24: recognize every progress/handoff filename the course itself uses.
    candidates: [
      "claude-progress.md",
      "PROGRESS.md",
      "HANDOFF.md",
      "handoff.md",
      "SESSION_NOTES.md",
      "session-handoff.md",
      path5.join("docs", "handoff.md"),
      ".handoff"
    ]
  },
  {
    name: "Testing structure",
    description: "Test directory or test configuration",
    maxPoints: 10,
    candidates: ["test", "tests", "__tests__", "spec"],
    isDir: true
  },
  {
    name: "Configuration files",
    description: "Project config (package.json, tsconfig, etc.)",
    maxPoints: 10,
    candidates: ["package.json", "tsconfig.json", "pyproject.toml", "Cargo.toml", "go.mod"]
  },
  {
    name: "README",
    description: "Root README file",
    maxPoints: 10,
    candidates: ["README.md", "README.rst", "README.txt", "README"]
  }
];
function scoreRepo(targetDir) {
  const resolved = path5.resolve(targetDir);
  const projectPaths = resolveProjectPaths(resolved);
  const dynamicCandidates = {
    "Feature tracking": [path5.relative(resolved, projectPaths.featureListPath)],
    "Handoff / session continuity": [
      path5.relative(resolved, projectPaths.progressPath),
      path5.relative(resolved, projectPaths.handoffPath)
    ]
  };
  const checks = CHECK_DEFS.map((def) => {
    const allCandidates = [...def.candidates, ...dynamicCandidates[def.name] ?? []];
    const found = allCandidates.filter((c) => {
      const p = path5.join(resolved, c);
      if (!fs4.existsSync(p)) return false;
      const stat = fs4.statSync(p);
      return def.isDir ? stat.isDirectory() : stat.isFile() || stat.isDirectory();
    });
    return {
      name: def.name,
      description: def.description,
      maxPoints: def.maxPoints,
      points: found.length > 0 ? def.maxPoints : 0,
      found,
      missing: found.length > 0 ? [] : [allCandidates[0]]
    };
  });
  const totalScore = checks.reduce((s, c) => s + c.points, 0);
  const maxScore = checks.reduce((s, c) => s + c.maxPoints, 0);
  const percent = maxScore > 0 ? totalScore / maxScore : 0;
  let grade;
  if (percent >= 0.9) grade = "A";
  else if (percent >= 0.7) grade = "B";
  else if (percent >= 0.5) grade = "C";
  else if (percent >= 0.3) grade = "D";
  else grade = "F";
  return { target: resolved, checks, totalScore, maxScore, percent, grade };
}
function formatRepoScore(result) {
  const lines = [];
  lines.push(`Repository discoverability score: ${result.target}`);
  lines.push("-".repeat(70));
  for (const c of result.checks) {
    const status = c.points > 0 ? "PASS" : "FAIL";
    const detail = c.found.length > 0 ? c.found.join(", ") : `missing: ${c.missing.join(", ")}`;
    lines.push(`[${status}] ${c.name.padEnd(28)} ${c.points}/${c.maxPoints}  ${detail}`);
  }
  lines.push("-".repeat(70));
  lines.push(`TOTAL: ${result.totalScore}/${result.maxScore} (${Math.round(result.percent * 100)}%)  GRADE: ${result.grade}`);
  return lines.join("\n");
}

// src/core/event-log.ts
var fs5 = __toESM(require("node:fs"), 1);
var path6 = __toESM(require("node:path"), 1);
var MAX_LOG_BYTES = 2e6;
var EventLog = class {
  filePath;
  constructor(hxDir) {
    fs5.mkdirSync(hxDir, { recursive: true });
    this.filePath = path6.join(hxDir, "events.jsonl");
  }
  append(type, data = {}) {
    const event = { ts: (/* @__PURE__ */ new Date()).toISOString(), type, ...data };
    this.rotateIfLarge();
    fs5.appendFileSync(this.filePath, JSON.stringify(event) + "\n", "utf-8");
    return event;
  }
  /** Move the current log aside rather than truncating it: this is an audit trail, and silently
   *  discarding history to stay small is the wrong trade for a file this cheap to keep. */
  rotateIfLarge() {
    try {
      if (!fs5.existsSync(this.filePath)) return;
      if (fs5.statSync(this.filePath).size < MAX_LOG_BYTES) return;
      const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      fs5.renameSync(this.filePath, `${this.filePath}.${stamp}.bak`);
    } catch {
    }
  }
  /** Lines that failed to parse on the most recent readAll(), newest call wins. */
  lastCorrupt = 0;
  corruptLineCount() {
    return this.lastCorrupt;
  }
  readAll() {
    this.lastCorrupt = 0;
    if (!fs5.existsSync(this.filePath)) return [];
    const content = fs5.readFileSync(this.filePath, "utf-8");
    const events = [];
    for (const line of content.split("\n")) {
      if (line.trim().length === 0) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        this.lastCorrupt += 1;
      }
    }
    return events;
  }
  readLast(n) {
    const all = this.readAll();
    return all.slice(-n);
  }
  readByType(type) {
    return this.readAll().filter((e) => e.type === type);
  }
};
function hxDirFor(repoRoot) {
  return resolveProjectPaths(repoRoot).hxDir;
}

// src/core/feature-list.ts
var fs6 = __toESM(require("node:fs"), 1);
var path7 = __toESM(require("node:path"), 1);
var STATUSES = ["not_started", "in_progress", "blocked", "passing"];
var STATUS_ALIASES = {
  not_started: "not_started",
  "not-started": "not_started",
  active: "in_progress",
  in_progress: "in_progress",
  blocked: "blocked",
  passing: "passing",
  pass: "passing",
  done: "passing"
};
function normalizeStatus(raw) {
  if (typeof raw !== "string") return "not_started";
  const norm = STATUS_ALIASES[raw.toLowerCase()];
  return norm ?? "not_started";
}
var VerificationCmdEntry = external_exports.object({
  level: external_exports.enum(["static", "unit", "integration", "e2e"]).default("unit"),
  cmd: external_exports.string().min(1),
  manual: external_exports.undefined().optional()
});
var VerificationManualEntry = external_exports.object({
  level: external_exports.enum(["static", "unit", "integration", "e2e"]).default("e2e"),
  cmd: external_exports.undefined().optional(),
  manual: external_exports.array(external_exports.string()).min(1)
});
var VerificationEntry = external_exports.union([VerificationCmdEntry, VerificationManualEntry]);
var EvidenceEntry = external_exports.object({
  kind: external_exports.enum(["cmd", "manual-attest"]),
  cmd: external_exports.string().optional(),
  exitCode: external_exports.number().optional(),
  note: external_exports.string().optional(),
  attestedBy: external_exports.string().optional(),
  commit: external_exports.string().optional(),
  logPath: external_exports.string().optional(),
  testedAt: external_exports.string()
});
var FEATURE_ID_PATTERN = /^[^\s/\\;|&$`"'<>(){}]+$/;
var Feature = external_exports.object({
  id: external_exports.string().min(1).regex(FEATURE_ID_PATTERN, "Feature id must not contain whitespace or shell/path metacharacters"),
  priority: external_exports.number().int().default(999),
  area: external_exports.string().default(""),
  title: external_exports.string().min(1),
  user_visible_behavior: external_exports.string().default(""),
  scope: external_exports.array(external_exports.string()).default([]),
  verification: external_exports.array(VerificationEntry).default([]),
  status: external_exports.enum(STATUSES).default("not_started"),
  evidence: external_exports.array(EvidenceEntry).default([]),
  notes: external_exports.string().default(""),
  blockedReason: external_exports.string().optional(),
  /** FIELD-NOTES-shreedurga.md: "blocked on a person" vs. "blocked on a bug" turned out to be the
   *  most useful distinction the harness had no word for. `hx feature block --needs-human` sets
   *  this to "human"; a plain `hx feature block` sets it to "work". Absent (a feature blocked
   *  before this field existed) is read as "work" everywhere it's consumed — see
   *  `kit/handoff.ts`'s "Waiting on a human" section — never as a crash on missing data. */
  blockedBy: external_exports.enum(["human", "work"]).optional(),
  /** Lecture 7's scope surface as a DAG: this feature may not start until every id here is
   *  "passing". Unknown ids (a typo, a feature that was renamed) are treated as unmet rather
   *  than ignored — a dependency that can never resolve is a bug to surface, not a silent no-op. */
  dependsOn: external_exports.array(external_exports.string()).default([]),
  /** Lecture 11's sprint contract: a hash of the scope+verification this feature was contracted
   *  against at `hx feature start` time. `hx verify` recomputes and compares — a silent change to
   *  verification commands mid-implementation is exactly what CLAUDE.md's "do not silently
   *  change verification rules during implementation" rule already prohibits in prose; this makes
   *  it mechanical. Absent means no contract has been written yet (a feature started before this
   *  existed, or one never started at all). */
  contractHash: external_exports.string().optional(),
  /** Phase 8's advanced pack: the exec-plan this feature is driven from, e.g.
   *  "docs/exec-plans/active/2026-01-01-billing-retry.md". Only meaningful when
   *  `advancedPackEnabled` — `hx feature start` refuses a start without one in that mode
   *  (Lecture 6/7: a feature spanning more than one session needs a plan, not just a scope). */
  plan: external_exports.string().optional(),
  /** The product spec this feature implements, e.g. "docs/product-specs/new-user-onboarding.md" —
   *  doctor warns when this feature's code changed but the named spec did not (AGENTS.md's "if
   *  implementation changes what users see, update the matching spec"). */
  spec: external_exports.string().optional()
});
var FeatureListDoc = external_exports.object({
  project: external_exports.string().default("unnamed-project"),
  last_updated: external_exports.string().default(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)),
  rules: external_exports.object({
    single_active_feature: external_exports.boolean().default(true),
    passing_requires_evidence: external_exports.boolean().default(true),
    do_not_skip_verification: external_exports.boolean().default(true)
  }).default({}),
  status_legend: external_exports.record(external_exports.string()).default({
    not_started: "Work has not begun.",
    in_progress: "The feature is the current active task.",
    blocked: "Work cannot continue until a documented blocker is resolved.",
    passing: "Required verification has passed and evidence is recorded."
  }),
  features: external_exports.array(Feature).default([])
});
function importFeatureList(raw, projectHint = "unnamed-project") {
  if (Array.isArray(raw)) {
    const features = raw.map((entry) => importLegacyEntry(entry));
    return FeatureListDoc.parse({ project: projectHint, features });
  }
  if (raw && typeof raw === "object" && Array.isArray(raw.features)) {
    const obj = raw;
    const features = obj.features.map((f) => importCanonicalOrLegacyEntry(f));
    return FeatureListDoc.parse({ ...obj, features });
  }
  return FeatureListDoc.parse({ project: projectHint, features: [] });
}
function importCanonicalOrLegacyEntry(entry) {
  const e = entry && typeof entry === "object" ? entry : {};
  const title = e.title ?? e.name ?? e.description ?? e.id ?? "untitled";
  let status = "not_started";
  if (typeof e.status === "string") status = normalizeStatus(e.status);
  else if (e.passes === true) status = "passing";
  else if (e.passes === false) status = "not_started";
  return Feature.parse({
    ...e,
    id: e.id ?? `imported-${Math.random().toString(36).slice(2, 8)}`,
    area: e.area ?? e.category ?? "",
    title,
    user_visible_behavior: e.user_visible_behavior ?? e.description ?? "",
    status,
    verification: normalizeVerification(e.verification),
    evidence: Array.isArray(e.evidence) ? e.evidence : [],
    notes: e.notes ?? ""
  });
}
function importLegacyEntry(entry) {
  return importCanonicalOrLegacyEntry(entry);
}
function normalizeVerification(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.every((v) => typeof v === "string") && raw.length > 0) {
    return [{ level: "e2e", manual: raw }];
  }
  return raw.map((v) => {
    const parsed = VerificationEntry.safeParse(v);
    return parsed.success ? parsed.data : null;
  }).filter((v) => v !== null);
}
function loadFeatureList(filePath) {
  let text;
  try {
    text = fs6.readFileSync(filePath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new FeatureListError(
        `No feature list at ${filePath}. Run \`hx init\` (root layout) or \`hx kit install\` (kit layout) to create one, or \`hx feature import <file>\` to bring an existing list in.`
      );
    }
    throw err;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new FeatureListError(`${filePath} is not valid JSON: ${err.message}`);
  }
  const projectHint = path7.basename(path7.dirname(path7.resolve(filePath)));
  return importFeatureList(raw, projectHint);
}
function saveFeatureList(filePath, doc) {
  doc.last_updated = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  fs6.mkdirSync(path7.dirname(path7.resolve(filePath)), { recursive: true });
  fs6.writeFileSync(filePath, JSON.stringify(doc, null, 2) + "\n", "utf-8");
}
var FeatureListError = class extends Error {
};
function unmetDependencies(doc, feature2) {
  if (feature2.dependsOn.length === 0) return [];
  const byId = new Map(doc.features.map((f) => [f.id, f]));
  return feature2.dependsOn.filter((depId) => byId.get(depId)?.status !== "passing");
}
function findDependencyCycle(doc) {
  const byId = new Map(doc.features.map((f) => [f.id, f]));
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  function visit(id) {
    const st = state.get(id);
    if (st === "done") return null;
    if (st === "visiting") {
      const cycleStart = stack.indexOf(id);
      return [...stack.slice(cycleStart), id];
    }
    state.set(id, "visiting");
    stack.push(id);
    const feature2 = byId.get(id);
    if (feature2) {
      for (const dep of feature2.dependsOn) {
        if (!byId.has(dep)) continue;
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, "done");
    return null;
  }
  for (const f of doc.features) {
    const found = visit(f.id);
    if (found) return found;
  }
  return null;
}
function pickNext(doc) {
  const candidates = doc.features.filter((f) => f.status === "not_started" && unmetDependencies(doc, f).length === 0);
  return candidates.sort((a, b) => a.priority - b.priority)[0];
}
function activeFeature(doc) {
  return doc.features.find((f) => f.status === "in_progress");
}
function verifiedCompletionRate(doc) {
  const closed = doc.features.filter((f) => f.status === "passing" || f.status === "blocked");
  if (closed.length === 0) return 1;
  const passing = closed.filter((f) => f.status === "passing").length;
  return passing / closed.length;
}
function vcrStatus(doc) {
  return {
    vcr: verifiedCompletionRate(doc),
    blockedIds: doc.features.filter((f) => f.status === "blocked").map((f) => f.id)
  };
}
function startFeature(doc, id, opts = {}) {
  if (doc.rules.single_active_feature && activeFeature(doc)) {
    throw new FeatureListError(
      `WIP=1 violation: feature "${activeFeature(doc).id}" is already in_progress. Finish or block it first.`
    );
  }
  const feature2 = doc.features.find((f) => f.id === id);
  if (!feature2) throw new FeatureListError(`No such feature: ${id}`);
  if (feature2.status === "passing") {
    throw new FeatureListError(`Feature "${id}" is already passing. Use reopen to redo it.`);
  }
  const unmetDeps = unmetDependencies(doc, feature2);
  if (unmetDeps.length > 0) {
    throw new FeatureListError(
      `ERROR: "${id}" depends on ${unmetDeps.join(", ")}, which ${unmetDeps.length === 1 ? "is" : "are"} not yet passing.
WHY: Lecture 7's scope surface \u2014 a feature may not start until its declared dependsOn features are passing, so work does not proceed out of order.
FIX: finish and verify ${unmetDeps.join(", ")} first, or remove the dependency from "${id}"'s dependsOn if it no longer applies.`
    );
  }
  const { vcr, blockedIds } = vcrStatus(doc);
  const vcrGate = opts.vcrGate ?? "warn";
  let vcrWarning = null;
  if (vcr < 1) {
    const detail = `VCR (Verified Completion Rate) is ${(vcr * 100).toFixed(0)}%. Blocked feature(s) with no resolution recorded: ${blockedIds.join(", ") || "(none \u2014 see notes)"}.`;
    if (vcrGate === "block") {
      throw new FeatureListError(
        `ERROR: refusing to start a new feature while VCR < 100%.
WHY: ${detail} (Lecture 7 \u2014 new task activations are blocked while VCR < 1.0, so blocked work cannot be silently bypassed by starting something else.)
FIX: resolve or reopen ${blockedIds.join(", ") || "the blocked feature(s)"} first, or set "vcrGate": "warn" in .claude/hx.config.json if this project accepts a documented backlog.`
      );
    }
    vcrWarning = detail;
  }
  feature2.status = "in_progress";
  return { doc, vcrWarning };
}
function blockFeature(doc, id, reason, blockedBy = "work") {
  const feature2 = doc.features.find((f) => f.id === id);
  if (!feature2) throw new FeatureListError(`No such feature: ${id}`);
  feature2.status = "blocked";
  feature2.blockedReason = reason;
  feature2.blockedBy = blockedBy;
  return doc;
}
function markPassing(doc, id, evidence) {
  if (evidence.length === 0) {
    throw new FeatureListError(`Cannot mark "${id}" passing without evidence (course-issue #6/#21).`);
  }
  const feature2 = doc.features.find((f) => f.id === id);
  if (!feature2) throw new FeatureListError(`No such feature: ${id}`);
  feature2.status = "passing";
  feature2.evidence.push(...evidence);
  return doc;
}
function resetAllFeatures(doc) {
  for (const feature2 of doc.features) {
    feature2.status = "not_started";
    feature2.evidence = [];
    feature2.contractHash = void 0;
    feature2.blockedReason = void 0;
    feature2.blockedBy = void 0;
  }
  return doc;
}
function reopenFeature(doc, id, reason) {
  if (!reason || !reason.trim()) {
    throw new FeatureListError("reopen requires --reason");
  }
  const feature2 = doc.features.find((f) => f.id === id);
  if (!feature2) throw new FeatureListError(`No such feature: ${id}`);
  feature2.status = "not_started";
  feature2.notes = `${feature2.notes ? feature2.notes + " | " : ""}reopened: ${reason}`.trim();
  return doc;
}

// src/kit/advanced.ts
var fs8 = __toESM(require("node:fs"), 1);
var path9 = __toESM(require("node:path"), 1);

// src/core/cleanup-scan.ts
var fs7 = __toESM(require("node:fs"), 1);
var path8 = __toESM(require("node:path"), 1);
var import_node_child_process = require("node:child_process");
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".hx"]);
function toPosix(p) {
  return p.split(path8.sep).join("/");
}
function isTrackedByGit(base, relPath) {
  try {
    (0, import_node_child_process.execFileSync)("git", ["ls-files", "--error-unmatch", "--", relPath], {
      cwd: base,
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 5e3
    });
    return true;
  } catch {
    return false;
  }
}
function walk(dir, base, maxDepth, onFile, depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = fs7.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path8.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, maxDepth, onFile, depth + 1);
    } else if (entry.isFile()) {
      onFile(toPosix(path8.relative(base, full)), full);
    }
  }
}
function findByExt(base, extensions) {
  const found = [];
  walk(base, base, 4, (rel) => {
    if (extensions.some((ext) => rel.endsWith(ext))) found.push(rel);
  });
  return found;
}
function findSourceLogFiles(base) {
  const found = [];
  const srcRoots = /* @__PURE__ */ new Set(["src", "lib", "app"]);
  walk(base, base, 6, (rel) => {
    if (!rel.endsWith(".log")) return;
    const firstSegment = rel.split("/")[0];
    if (firstSegment && srcRoots.has(firstSegment)) found.push(rel);
  });
  return found;
}
function scanForPatterns(base, patterns) {
  const found = [];
  const srcRoots = ["src", "lib", "app"];
  for (const root of srcRoots) {
    const rootPath = path8.join(base, root);
    if (!fs7.existsSync(rootPath)) continue;
    walk(rootPath, base, 8, (rel, full) => {
      if (!/\.(ts|tsx|js|jsx)$/.test(rel)) return;
      let content;
      try {
        content = fs7.readFileSync(full, "utf-8");
      } catch {
        return;
      }
      const lines = content.split("\n");
      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        for (const pattern of patterns) {
          if (lines[i].includes(pattern)) {
            found.push(`${rel}:${i + 1} contains ${pattern}`);
          }
        }
      }
    });
  }
  return found;
}
function scanCleanup(targetDir) {
  const base = path8.resolve(targetDir);
  const findings = [];
  findings.push({
    category: "Stale Artifacts",
    check: "Temporary files (*.tmp, *.bak, *.swp, ~)",
    severity: "warning",
    description: "Leftover temp files from editing or processing",
    found: findByExt(base, [".tmp", ".bak", ".swp", "~"])
  });
  findings.push({
    category: "Stale Artifacts",
    check: "Log files in source directories",
    severity: "warning",
    description: "Log files that should not be committed with the source tree",
    found: findSourceLogFiles(base)
  });
  findings.push({
    category: "Dead Code",
    check: "TODO / FIXME / HACK / XXX markers",
    severity: "info",
    description: "Unresolved markers left in source (heuristic scan, first 50 lines/file)",
    found: scanForPatterns(base, ["TODO:", "FIXME:", "HACK:", "XXX:"])
  });
  findings.push({
    category: "Structural Violations",
    check: "Missing .gitignore",
    severity: "warning",
    description: "No .gitignore \u2014 risk of committing build artifacts or secrets",
    found: fs7.existsSync(path8.join(base, ".gitignore")) ? [] : [".gitignore (MISSING)"]
  });
  const buildInSrc = ["src/dist", "src/build", "lib/dist", "lib/build"].filter(
    (p) => fs7.existsSync(path8.join(base, ...p.split("/")))
  );
  findings.push({
    category: "Structural Violations",
    check: "Build artifacts mixed with source",
    severity: "critical",
    description: "Compiled output found inside a source directory",
    found: buildInSrc
  });
  const nestedNodeModules = ["src", "lib", "app", "test", "tests"].map((d) => path8.join(d, "node_modules")).filter((p) => fs7.existsSync(path8.join(base, p)));
  findings.push({
    category: "Structural Violations",
    check: "Nested node_modules",
    severity: "critical",
    description: "A node_modules directory found outside the project root",
    found: nestedNodeModules
  });
  const wipIndicators = ["WIP.md", "IN_PROGRESS.md", "scratch.ts", "scratch.js", "debug.ts", "test-manual.ts", "temp.ts"].filter(
    (f) => fs7.existsSync(path8.join(base, f))
  );
  findings.push({
    category: "Session Cleanliness",
    check: "Uncommitted-session indicator files",
    severity: "info",
    description: "Files that typically mark an incomplete session",
    found: wipIndicators
  });
  const commonDirs = ["src", "lib", "app", "test", "tests", "docs"];
  const emptyDirs = commonDirs.filter((d) => {
    const p = path8.join(base, d);
    if (!fs7.existsSync(p) || !fs7.statSync(p).isDirectory()) return false;
    try {
      return fs7.readdirSync(p).length === 0;
    } catch {
      return false;
    }
  });
  findings.push({
    category: "Session Cleanliness",
    check: "Empty directories",
    severity: "info",
    description: "Empty directories, possibly leftover from incomplete work",
    found: emptyDirs.map((d) => toPosix(d) + "/")
  });
  const envFiles = [".env", ".env.local", ".env.production", ".env.staging"].filter(
    (f) => fs7.existsSync(path8.join(base, f))
  );
  const trackedEnvFiles = envFiles.filter((f) => isTrackedByGit(base, f));
  const untrackedEnvFiles = envFiles.filter((f) => !trackedEnvFiles.includes(f));
  findings.push({
    category: "Configuration",
    check: "Environment files committed to git",
    severity: "critical",
    description: "A .env file tracked by git puts secrets in the repository history \u2014 untrack it (`git rm --cached`) and confirm it is in .gitignore",
    found: trackedEnvFiles
  });
  findings.push({
    category: "Configuration",
    check: "Environment files present (untracked)",
    severity: "info",
    description: "Local .env files \u2014 normal, listed for awareness only, never auto-modified",
    found: untrackedEnvFiles
  });
  return findings;
}
var DEBUG_CODE_SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"];
var DEBUG_CODE_RE = /console\.log\s*\(|(?<![\w.$])debugger\b|(?<![\w.$])print\s*\(/;
function scanChangedFilesForDebugCode(repoRoot, changedFiles) {
  const findings = [];
  for (const rel of changedFiles) {
    if (!DEBUG_CODE_SOURCE_EXTS.some((ext) => rel.endsWith(ext))) continue;
    let content;
    try {
      content = fs7.readFileSync(path8.join(repoRoot, ...rel.split("/")), "utf-8");
    } catch {
      continue;
    }
    content.split("\n").forEach((line, i) => {
      const m = line.match(DEBUG_CODE_RE);
      if (m) findings.push({ file: rel, line: i + 1, match: m[0].trim() });
    });
  }
  return findings;
}
function isTestPath(rel) {
  return /(^|\/)(test|tests|__tests__|spec)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
}
function countTestBlocks(content) {
  return (content.match(/\b(it|test|describe)\s*\(/g) || []).length;
}
function scanForTestWeakening(repoRoot, changedFiles) {
  const findings = [];
  for (const rel of changedFiles) {
    if (!isTestPath(rel)) continue;
    let before;
    try {
      before = (0, import_node_child_process.execFileSync)("git", ["show", `HEAD:${rel}`], {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      before = null;
    }
    const full = path8.join(repoRoot, ...rel.split("/"));
    const existsNow = fs7.existsSync(full);
    if (!existsNow) {
      if (before !== null) findings.push({ file: rel, reason: "deleted" });
      continue;
    }
    if (before === null) continue;
    const beforeCount = countTestBlocks(before);
    let afterCount;
    try {
      afterCount = countTestBlocks(fs7.readFileSync(full, "utf-8"));
    } catch {
      continue;
    }
    if (afterCount < beforeCount) {
      findings.push({ file: rel, reason: "fewer-test-blocks", before: beforeCount, after: afterCount });
    }
  }
  return findings;
}
function isClean(findings) {
  return !findings.some((f) => f.severity === "critical" && f.found.length > 0);
}

// src/kit/advanced.ts
function walkAdvancedTemplates(dir, base, out) {
  for (const entry of fs8.readdirSync(dir, { withFileTypes: true })) {
    const full = path9.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAdvancedTemplates(full, base, out);
    } else {
      out.push(toPosix(path9.relative(base, full)));
    }
  }
}
function advancedTemplatePaths() {
  const base = path9.join(templatesDir(), "advanced");
  const out = [];
  walkAdvancedTemplates(base, base, out);
  return out.sort();
}
function readAdvancedTemplate(relPath) {
  return fs8.readFileSync(path9.join(templatesDir(), "advanced", relPath), "utf-8");
}
function writeAdvancedPack(resolved, writeIfAbsent) {
  for (const relPath of advancedTemplatePaths()) {
    writeIfAbsent(path9.join(resolved, ...relPath.split("/")), readAdvancedTemplate(relPath));
  }
}
function isAdvancedPack(root) {
  return fs8.existsSync(path9.join(root, "docs", "PLANS.md"));
}
function parseSecurityDangerousCommands(root) {
  const full = path9.join(root, "docs", "SECURITY.md");
  if (!fs8.existsSync(full)) return [];
  const content = fs8.readFileSync(full, "utf-8");
  const start = content.indexOf("## External Actions");
  if (start === -1) return [];
  const nextHeading = content.indexOf("\n## ", start + 1);
  const section = content.slice(start, nextHeading === -1 ? content.length : nextHeading);
  const patterns = [];
  const codeSpanRe = /`([^`]+)`/g;
  for (const line of section.split("\n")) {
    if (!/^\s*[-*]\s+/.test(line)) continue;
    for (const m of line.matchAll(codeSpanRe)) {
      const pattern = m[1].trim();
      if (!pattern) continue;
      try {
        new RegExp(pattern);
        patterns.push(pattern);
      } catch {
      }
    }
  }
  return patterns;
}

// src/kit/init.ts
var MINIMAL_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "claude-progress.md",
  "clean-state-checklist.md",
  "evaluator-rubric.md",
  "session-handoff.md",
  "LESSONS.md"
];
function isGitRepo(resolved) {
  return fs9.existsSync(path10.join(resolved, ".git"));
}
function tryGit(resolved, args) {
  try {
    return (0, import_node_child_process2.execFileSync)("git", args, { cwd: resolved, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
function commitBaseline(resolved, written, wasCleanBefore) {
  if (written.length === 0) {
    return { committed: false, warning: "nothing new was written (files already existed) \u2014 no baseline commit needed." };
  }
  if (!isGitRepo(resolved)) {
    if (tryGit(resolved, ["init", "-q"]) === null) {
      return { committed: false, warning: "could not run `git init` \u2014 is git installed? No baseline commit made." };
    }
  } else if (!wasCleanBefore) {
    return {
      committed: false,
      warning: "the working tree had uncommitted changes before hx init ran \u2014 not committing them on your behalf. Commit manually."
    };
  }
  if (tryGit(resolved, ["add", "--", ...written]) === null) {
    return { committed: false, warning: "`git add` failed for the newly written files. No baseline commit made." };
  }
  const commitOut = tryGit(resolved, ["commit", "-q", "-m", "chore: harness baseline"]);
  if (commitOut === null) {
    return {
      committed: false,
      warning: "`git commit` failed \u2014 likely no git user.email/user.name configured. Run `git config user.email/user.name` and commit manually."
    };
  }
  const committedFiles = (tryGit(resolved, ["show", "--name-only", "--format=", "HEAD"]) ?? "").split("\n").map((l) => l.trim().replace(/\\/g, "/")).filter(Boolean);
  const writtenSet = new Set(written.map((w) => w.replace(/\\/g, "/")));
  const unexpected = committedFiles.filter((f) => !writtenSet.has(f));
  if (unexpected.length > 0) {
    return { committed: true, violation: unexpected };
  }
  return { committed: true };
}
function fillKitCommands(resolved, stack) {
  const configPath = path10.join(resolved, ".claude", "hx.config.json");
  if (!fs9.existsSync(configPath)) return false;
  let raw;
  try {
    raw = JSON.parse(fs9.readFileSync(configPath, "utf-8"));
  } catch {
    return false;
  }
  const existingCommands = raw.commands ?? {};
  if (existingCommands.install && existingCommands.verify && existingCommands.start) return false;
  raw.commands = {
    install: existingCommands.install ?? stack.install,
    verify: existingCommands.verify ?? stack.verify,
    start: existingCommands.start ?? stack.start,
    ...existingCommands.check ? { check: existingCommands.check } : {}
  };
  if (!KitConfigSchema.safeParse(raw).success) return false;
  fs9.writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n", "utf-8");
  return true;
}
function ensureHxGitignored(resolved) {
  const gitignorePath = path10.join(resolved, ".gitignore");
  const existing = fs9.existsSync(gitignorePath) ? fs9.readFileSync(gitignorePath, "utf-8") : "";
  const alreadyIgnored = existing.split("\n").some((l) => l.trim() === ".hx/" || l.trim() === ".hx" || l.trim() === "/.hx/");
  if (alreadyIgnored) return null;
  const updated = existing.length > 0 && !existing.endsWith("\n") ? existing + "\n.hx/\n" : existing + ".hx/\n";
  fs9.writeFileSync(gitignorePath, updated, "utf-8");
  return gitignorePath;
}
function runInit(targetDir, opts = {}) {
  const resolved = path10.resolve(targetDir);
  fs9.mkdirSync(resolved, { recursive: true });
  const projectName = path10.basename(resolved);
  const stack = detectStack(resolved);
  const paths = resolveProjectPaths(resolved);
  const written = [];
  const wasCleanBefore = !isGitRepo(resolved) || (tryGit(resolved, ["status", "--porcelain"]) ?? "").trim() === "";
  const writeIfAbsent = (fullPath, content) => {
    if (fs9.existsSync(fullPath) && !opts.force) {
      return;
    }
    fs9.mkdirSync(path10.dirname(fullPath), { recursive: true });
    fs9.writeFileSync(fullPath, content, "utf-8");
    written.push(path10.relative(resolved, fullPath).split(path10.sep).join("/"));
  };
  if (paths.layout === "root") {
    const gitignorePath = ensureHxGitignored(resolved);
    if (gitignorePath) written.push(".gitignore");
    for (const name of MINIMAL_FILES) {
      if (opts.advanced && name === "AGENTS.md") continue;
      writeIfAbsent(path10.join(resolved, name), renderTemplate(readTemplate(name), { PROJECT_ROOT: resolved, DATE: todayISO() }));
    }
    writeIfAbsent(
      path10.join(resolved, "init.sh"),
      renderTemplate(readTemplate("init.sh"), { INSTALL_CMD: stack.install, VERIFY_CMD: stack.verify, START_CMD: stack.start })
    );
    writeIfAbsent(
      path10.join(resolved, "init.ps1"),
      renderTemplate(readTemplate("init.ps1"), { INSTALL_CMD: stack.install, VERIFY_CMD: stack.verify, START_CMD: stack.start })
    );
    try {
      fs9.chmodSync(path10.join(resolved, "init.sh"), 493);
    } catch {
    }
  } else {
    if (fillKitCommands(resolved, stack)) written.push(".claude/hx.config.json (commands filled in)");
  }
  writeIfAbsent(paths.featureListPath, renderTemplate(readTemplate("feature_list.json"), { PROJECT_NAME: projectName, DATE: todayISO() }));
  writeIfAbsent(paths.qualityDocPath, readTemplate("quality-document.md"));
  if (opts.advanced) {
    writeAdvancedPack(resolved, writeIfAbsent);
  }
  const eventLog = new EventLog(hxDirFor(resolved));
  eventLog.append("init", { advanced: !!opts.advanced, filesWritten: written, stack, layout: paths.layout });
  if (opts.commit) {
    const result = commitBaseline(resolved, written, wasCleanBefore);
    if (!result.committed) {
      eventLog.append("init.baseline-skipped", result);
    } else {
      eventLog.append("init.baseline-commit", result);
      if (result.violation) {
        eventLog.append("init.baseline-violation", { unexpected: result.violation, written });
      }
    }
  }
  return written;
}
function freshSessionTest(targetDir) {
  const resolved = path10.resolve(targetDir);
  const score = scoreRepo(resolved);
  const has = (name) => score.checks.find((c) => c.name === name)?.points > 0;
  const paths = resolveProjectPaths(resolved);
  const startupPathExists = fs9.existsSync(path10.join(resolved, "init.sh")) || fs9.existsSync(path10.join(resolved, "init.ps1")) || Boolean(paths.kitConfig?.commands.start);
  let featureListLoaded = false;
  let hasVerificationEntries = false;
  let unfinishedFeatureVisible = false;
  let nextStepVisible = false;
  try {
    if (fs9.existsSync(paths.featureListPath)) {
      const doc = loadFeatureList(paths.featureListPath);
      featureListLoaded = true;
      hasVerificationEntries = doc.features.some((f) => f.verification.length > 0);
      unfinishedFeatureVisible = doc.features.some((f) => f.status !== "passing");
      nextStepVisible = Boolean(pickNext(doc) || activeFeature(doc));
    }
  } catch {
  }
  const unfinishedAnswered = featureListLoaded ? unfinishedFeatureVisible : has("Feature tracking");
  const nextStepAnswered = featureListLoaded ? nextStepVisible : has("Handoff / session continuity");
  return [
    { question: "What is this system? (AGENTS.md/CLAUDE.md/README)", answered: has("AGENTS.md / CLAUDE.md") || has("README") },
    { question: "How is it organized? (ARCHITECTURE.md)", answered: has("Architecture documentation") },
    { question: "How do I start it? (init.sh, init.ps1, or commands.start)", answered: startupPathExists },
    { question: "How do I verify it? (feature verification commands)", answered: hasVerificationEntries },
    { question: "What is unfinished? (feature list status)", answered: unfinishedAnswered },
    { question: "What is the next best step? (feature priority / handoff)", answered: nextStepAnswered }
  ];
}
function initAcceptanceChecklist(targetDir) {
  const resolved = path10.resolve(targetDir);
  const paths = resolveProjectPaths(resolved);
  const freshSession = freshSessionTest(resolved);
  let featureCount = 0;
  try {
    if (fs9.existsSync(paths.featureListPath)) featureCount = loadFeatureList(paths.featureListPath).features.length;
  } catch {
    featureCount = 0;
  }
  const dirty = isGitRepo(resolved) ? (tryGit(resolved, ["status", "--porcelain"]) ?? "").trim().length > 0 : true;
  return [
    ...freshSession.map((q) => ({ label: q.question, passed: q.answered })),
    { label: "Task breakdown has at least 3 features", passed: featureCount >= 3 },
    { label: "Everything is committed to git", passed: !dirty }
  ];
}

// src/kit/doctor.ts
var fs22 = __toESM(require("node:fs"), 1);
var path22 = __toESM(require("node:path"), 1);
var os = __toESM(require("node:os"), 1);
var import_node_child_process7 = require("node:child_process");

// src/core/init-check.ts
var fs10 = __toESM(require("node:fs"), 1);
var path11 = __toESM(require("node:path"), 1);
var import_node_child_process3 = require("node:child_process");
function tscAvailable(targetDir) {
  const localBin = path11.join(
    targetDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc"
  );
  if (fs10.existsSync(localBin)) {
    try {
      const out = (0, import_node_child_process3.execFileSync)(localBin, ["--version"], { encoding: "utf-8", timeout: 5e3 }).trim();
      return { pass: true, detail: `Found: ${out}` };
    } catch {
    }
  }
  return { pass: false, detail: "TypeScript not found in node_modules/.bin" };
}
function stackChecks(resolved, kind, exists, isDir) {
  const results = [];
  if (kind === "node" || kind === "unknown") {
    results.push({
      name: "Node.js version >= 18",
      category: "Runtime",
      passed: parseInt(process.version.replace("v", "").split(".")[0], 10) >= 18,
      detail: `Detected: ${process.version} (need >= v18)`,
      impactIfMissing: "Modern TypeScript/ESM features and built-in APIs may be unavailable"
    });
    results.push({
      name: "package.json exists",
      category: "Config",
      passed: exists("package.json"),
      detail: exists("package.json") ? "Found" : "Not found in target directory",
      impactIfMissing: "Cannot install dependencies or run scripts"
    });
    results.push({
      name: "Dependencies installed (node_modules)",
      category: "Dependencies",
      passed: isDir("node_modules"),
      detail: isDir("node_modules") ? "Found" : "node_modules/ not found \u2014 run the install command",
      impactIfMissing: "All imports fail at runtime"
    });
    if (exists("tsconfig.json")) {
      const tsc = tscAvailable(resolved);
      results.push({
        name: "TypeScript available",
        category: "Toolchain",
        passed: tsc.pass,
        detail: tsc.detail,
        impactIfMissing: "Cannot compile TypeScript files"
      });
    }
  } else if (kind === "python-pyproject" || kind === "python-requirements") {
    const configName = kind === "python-pyproject" ? "pyproject.toml" : "requirements.txt";
    results.push({
      name: `${configName} exists`,
      category: "Config",
      passed: exists(configName),
      detail: exists(configName) ? "Found" : `Not found in target directory`,
      impactIfMissing: "Cannot install dependencies or determine the run command"
    });
    const depMarkers = [".venv", "venv", "uv.lock", "poetry.lock"];
    const foundDep = depMarkers.some((m) => exists(m));
    results.push({
      name: "Dependencies installed (virtualenv or lockfile)",
      category: "Dependencies",
      passed: foundDep,
      detail: foundDep ? `Found: ${depMarkers.filter((m) => exists(m)).join(", ")}` : "No .venv/, venv/, uv.lock, or poetry.lock found \u2014 run the install command",
      impactIfMissing: "Imports fail at runtime, or the wrong interpreter's packages are used"
    });
  } else if (kind === "rust") {
    results.push({
      name: "Cargo.toml exists",
      category: "Config",
      passed: exists("Cargo.toml"),
      detail: exists("Cargo.toml") ? "Found" : "Not found in target directory",
      impactIfMissing: "Cannot build or run with cargo"
    });
    results.push({
      name: "Dependencies built (target/)",
      category: "Dependencies",
      passed: isDir("target"),
      detail: isDir("target") ? "Found" : "target/ not found \u2014 run cargo build",
      impactIfMissing: "First build will be slow, and cargo test/run may not have been verified yet"
    });
  } else if (kind === "go") {
    results.push({
      name: "go.mod exists",
      category: "Config",
      passed: exists("go.mod"),
      detail: exists("go.mod") ? "Found" : "Not found in target directory",
      impactIfMissing: "Cannot build, test, or run with go"
    });
    results.push({
      name: "Dependencies declared (go.sum)",
      category: "Dependencies",
      passed: exists("go.sum"),
      detail: exists("go.sum") ? "Found" : "go.sum not found \u2014 run go mod download/tidy",
      impactIfMissing: "Module versions are unpinned; builds may not be reproducible"
    });
  }
  return results;
}
function runInitChecks(targetDir) {
  const resolved = path11.resolve(targetDir);
  const exists = (p) => fs10.existsSync(path11.join(resolved, p));
  const isDir = (p) => exists(p) && fs10.statSync(path11.join(resolved, p)).isDirectory();
  const results = [];
  const stack = detectStack(resolved);
  results.push(...stackChecks(resolved, stack.kind, exists, isDir));
  const srcCandidates = ["src", "lib", "app"];
  const foundSrc = srcCandidates.filter(isDir);
  results.push({
    name: "Source directory exists",
    category: "Structure",
    passed: foundSrc.length > 0,
    detail: foundSrc.length > 0 ? `Found: ${foundSrc.join(", ")}` : "No src/, lib/, or app/ directory found",
    impactIfMissing: "Agent cannot locate source files to modify"
  });
  const testCandidates = ["test", "tests", "__tests__", "spec"];
  const foundTest = testCandidates.filter(isDir);
  results.push({
    name: "Test directory exists",
    category: "Structure",
    passed: foundTest.length > 0,
    detail: foundTest.length > 0 ? `Found: ${foundTest.join(", ")}` : "No test directory found",
    impactIfMissing: "Agent cannot find or run existing tests"
  });
  results.push({
    name: "Git repository initialized",
    category: "Version Control",
    passed: exists(".git"),
    detail: exists(".git") ? "Git repository detected" : "No .git directory found",
    impactIfMissing: "No rollback capability, no change history, no checkpoint commits"
  });
  return results;
}
function formatInitChecks(results) {
  const lines = [];
  const failed = results.filter((r) => !r.passed);
  for (const r of results) {
    lines.push(`[${r.passed ? "PASS" : "FAIL"}] ${r.name}  (${r.category})  ${r.detail}`);
  }
  if (failed.length > 0) {
    lines.push("");
    lines.push("Impact of failing checks:");
    for (const r of failed) lines.push(`  - ${r.name}: ${r.impactIfMissing}`);
  }
  return lines.join("\n");
}

// src/core/rules.ts
var fs11 = __toESM(require("node:fs"), 1);
var path12 = __toESM(require("node:path"), 1);
var import_picomatch = __toESM(require_picomatch2(), 1);
var DEFAULT_EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build", ".hx", ".claude", "coverage"];
function walkFiles(dir, exts, onFile, base = dir) {
  let entries;
  try {
    entries = fs11.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (DEFAULT_EXCLUDED_DIRS.includes(entry.name)) continue;
      walkFiles(path12.join(dir, entry.name), exts, onFile, base);
    } else if (exts === null || exts.some((e) => entry.name.endsWith(e))) {
      onFile(toPosix(path12.relative(base, path12.join(dir, entry.name))), path12.join(dir, entry.name));
    }
  }
}
function walkFilesOrList(dir, exts, files, repoRoot, onFile, base = dir) {
  if (files === void 0) {
    walkFiles(dir, exts, onFile, base);
    return;
  }
  const dirResolved = path12.resolve(dir);
  for (const f of files) {
    const full = path12.resolve(repoRoot, f);
    if (exts !== null && !exts.some((e) => full.endsWith(e))) continue;
    if (full !== dirResolved && !full.startsWith(dirResolved + path12.sep)) continue;
    let stat;
    try {
      stat = fs11.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    onFile(toPosix(path12.relative(base, full)), full);
  }
}
var FS_IMPORT_PATTERN = /(?:require\(\s*['"](?:node:)?fs['"]\s*\)|from\s+['"](?:node:)?fs['"]|import\s+['"](?:node:)?fs['"])/;
var noFsInRenderer = {
  id: "no-fs-in-renderer",
  description: "Renderer code must not access the filesystem directly \u2014 go through the preload bridge.",
  check(repoRoot, files) {
    const violations = [];
    const rendererDir = path12.join(repoRoot, "src", "renderer");
    if (!fs11.existsSync(rendererDir)) return violations;
    walkFilesOrList(rendererDir, [".ts", ".tsx", ".js", ".jsx"], files, repoRoot, (rel, full) => {
      const content = fs11.readFileSync(full, "utf-8");
      content.split("\n").forEach((line, i) => {
        if (FS_IMPORT_PATTERN.test(line)) {
          violations.push({
            ruleId: "no-fs-in-renderer",
            file: rel,
            line: i + 1,
            error: `Direct filesystem import in renderer code.`,
            why: "Renderer has no Node.js API access for security; only preload may bridge to it.",
            fix: `Move this call to a preload module and invoke it via the exposed bridge API.`
          });
        }
      });
    });
    return violations;
  }
};
function lintVerificationCommand(cmd) {
  const violations = [];
  if (/\bjq\b/.test(cmd) && !/\bjq\s+(-[a-zA-Z]*e[a-zA-Z]*|--exit-status)/.test(cmd)) {
    violations.push({
      ruleId: "jq-without-exit-status",
      file: "<verification command>",
      error: `Command pipes to jq without -e: ${cmd}`,
      why: "jq's exit code reflects parse errors only unless run with -e; a false comparison still exits 0, so a pass gate built on this command's exit code will always pass.",
      fix: `Add -e to the jq invocation (e.g. jq -e '.status == 201'), or check output with a separate assertion whose own exit code is the gate.`
    });
  }
  violations.push(...lintUnscopedTestRunner(cmd));
  return violations;
}
var UNSCOPED_NODE_TEST_RE = /(?:^|[;&|]\s*)node\s+--test((?:\s+--[\w-]+(?:=\S+)?)*)\s*(?=$|[;&|])/;
function lintUnscopedTestRunner(cmd) {
  if (!UNSCOPED_NODE_TEST_RE.test(cmd)) return [];
  return [
    {
      ruleId: "unscoped-test-runner",
      file: "<verification command>",
      error: `Command runs 'node --test' with no positional path/glob argument: ${cmd}`,
      why: "node --test with no path recurses into every directory under cwd, including untracked vendor/reference drops \u2014 measured 171 foreign failures in one real verify.",
      fix: `Scope it to the project's own tests, e.g. node --test test/**/*.test.js (or whatever glob matches this repo's actual test directory).`
    }
  ];
}
function resolveRelativeImportPath(fileFullPath, specifier, repoRoot) {
  if (!specifier.startsWith(".")) return null;
  const resolved = path12.resolve(path12.dirname(fileFullPath), specifier);
  const rel = toPosix(path12.relative(repoRoot, resolved));
  if (rel.startsWith("..")) return null;
  return rel;
}
var LAYER_EXTENSION_GUESSES = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
function layerIndexFor(relPath, matchers) {
  for (const guess of LAYER_EXTENSION_GUESSES) {
    const candidate = relPath + guess;
    for (let i = 0; i < matchers.length; i++) {
      if (matchers[i](candidate)) return i;
    }
  }
  return -1;
}
var layerOrderRule = {
  id: "layer-order",
  description: "A layer must not import from a layer declared later in architecture.layers \u2014 lower layers must not depend on higher layers.",
  check(repoRoot, files) {
    const layers = resolveProjectPaths(repoRoot).kitConfig?.architecture.layers ?? [];
    if (layers.length < 2) return [];
    const matchers = layers.map((l) => (0, import_picomatch.default)(l.glob));
    const violations = [];
    walkFilesOrList(repoRoot, [".ts", ".tsx", ".js", ".jsx"], files, repoRoot, (rel, full) => {
      let sourceIdx = -1;
      for (let i = 0; i < matchers.length; i++) {
        if (matchers[i](rel)) {
          sourceIdx = i;
          break;
        }
      }
      if (sourceIdx === -1) return;
      let content;
      try {
        content = fs11.readFileSync(full, "utf-8");
      } catch {
        return;
      }
      for (const imp of extractImports(content)) {
        const targetRel = resolveRelativeImportPath(full, imp.specifier, repoRoot);
        if (!targetRel) continue;
        const targetIdx = layerIndexFor(targetRel, matchers);
        if (targetIdx === -1 || targetIdx <= sourceIdx) continue;
        violations.push({
          ruleId: "layer-order",
          file: rel,
          line: imp.line,
          error: `"${layers[sourceIdx].name}" imports from "${layers[targetIdx].name}" (${imp.specifier}) \u2014 a later layer.`,
          why: `Declared layer order: ${layers.map((l) => l.name).join(" -> ")}. Lower layers must not depend on higher layers.`,
          fix: "Move this dependency the other direction, or route it through an explicit provider/adapter interface instead of a direct import."
        });
      }
    });
    return violations;
  }
};
var CONSOLE_CALL_PATTERN = /console\.(log|warn|error|debug|info)\s*\(/;
var noConsoleOutsideLoggerRule = {
  id: "no-console-outside-logger",
  description: "console.* calls must live in a designated logging module, not scattered through application code.",
  check(repoRoot, files) {
    const violations = [];
    const advancedPack = fs11.existsSync(path12.join(repoRoot, "docs", "PLANS.md"));
    const allowedFiles = resolveProjectPaths(repoRoot).kitConfig?.logging.allowedFiles ?? [];
    if (!advancedPack && allowedFiles.length === 0) return violations;
    const isAllowed = (0, import_picomatch.default)([...allowedFiles, "**/logger.*", "**/logging/**", "**/*.test.*", "**/*.spec.*"]);
    walkFilesOrList(repoRoot, [".ts", ".tsx", ".js", ".jsx"], files, repoRoot, (rel, full) => {
      if (isAllowed(rel)) return;
      const content = fs11.readFileSync(full, "utf-8");
      content.split("\n").forEach((line, i) => {
        if (CONSOLE_CALL_PATTERN.test(line)) {
          violations.push({
            ruleId: "no-console-outside-logger",
            file: rel,
            line: i + 1,
            error: "console.* call outside a designated logging module.",
            why: "Scattered console.* calls are exactly what observability-feedback-loop.md's structured-logging minimum stack replaces.",
            fix: "Route this through the project's logger, or add this file to logging.allowedFiles in .claude/hx.config.json if it genuinely is one."
          });
        }
      });
    });
    return violations;
  }
};
var BUILT_IN_RULES = [noFsInRenderer, layerOrderRule, noConsoleOutsideLoggerRule];
function loadRulesFile(hxDir) {
  const p = path12.join(hxDir, "rules.json");
  if (!fs11.existsSync(p)) return { rules: [] };
  try {
    const parsed = JSON.parse(fs11.readFileSync(p, "utf-8"));
    if (parsed && Array.isArray(parsed.rules)) return parsed;
    return { rules: [] };
  } catch {
    return { rules: [] };
  }
}
function rulesFileParseError(hxDir) {
  const p = path12.join(hxDir, "rules.json");
  if (!fs11.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs11.readFileSync(p, "utf-8"));
    if (parsed && Array.isArray(parsed.rules)) return null;
    return `${p} parsed but has no "rules" array \u2014 every stored rule is being skipped.`;
  } catch (err) {
    return `${p} is not valid JSON (${err.message}) \u2014 every stored rule is being skipped.`;
  }
}
function addRule(hxDir, id, description, addedFrom, opts = {}) {
  const doc = loadRulesFile(hxDir);
  doc.rules.push({ id, description, addedFrom, addedAt: (/* @__PURE__ */ new Date()).toISOString(), check: opts.check, fix: opts.fix });
  fs11.mkdirSync(hxDir, { recursive: true });
  fs11.writeFileSync(path12.join(hxDir, "rules.json"), JSON.stringify(doc, null, 2) + "\n", "utf-8");
  return doc;
}
var IMPORT_SPECIFIER_RE = /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
function extractImports(content) {
  const out = [];
  content.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(IMPORT_SPECIFIER_RE)) {
      out.push({ line: i + 1, specifier: m[1] });
    }
  });
  return out;
}
function checkTextRule(rule2, repoRoot, files) {
  const { glob, pattern, mode } = rule2.check;
  if (!glob || !pattern) return [];
  const violations = [];
  const fix = rule2.fix ?? "No fix command was recorded when this rule was added \u2014 see the rule description.";
  let isMatch;
  let re;
  try {
    isMatch = (0, import_picomatch.default)(glob);
    re = new RegExp(pattern);
  } catch {
    return [];
  }
  walkFilesOrList(repoRoot, null, files, repoRoot, (rel, full) => {
    if (!isMatch(rel)) return;
    let content;
    try {
      content = fs11.readFileSync(full, "utf-8");
    } catch {
      return;
    }
    if (mode === "require") {
      if (!re.test(content)) {
        violations.push({
          ruleId: rule2.id,
          file: rel,
          error: `${rule2.description} (required pattern not found).`,
          why: rule2.description,
          fix
        });
      }
      return;
    }
    content.split("\n").forEach((line, i) => {
      if (re.test(line)) {
        violations.push({
          ruleId: rule2.id,
          file: rel,
          line: i + 1,
          error: `${rule2.description} (forbidden pattern matched).`,
          why: rule2.description,
          fix
        });
      }
    });
  });
  return violations;
}
function checkForbidImportRule(rule2, repoRoot, files) {
  const { from, import: importPattern } = rule2.check;
  if (!from || !importPattern) return [];
  const violations = [];
  const fix = rule2.fix ?? "No fix command was recorded when this rule was added \u2014 see the rule description.";
  let isMatch;
  let re;
  try {
    isMatch = (0, import_picomatch.default)(from);
    re = new RegExp(importPattern);
  } catch {
    return [];
  }
  walkFilesOrList(repoRoot, null, files, repoRoot, (rel, full) => {
    if (!isMatch(rel)) return;
    let content;
    try {
      content = fs11.readFileSync(full, "utf-8");
    } catch {
      return;
    }
    for (const imp of extractImports(content)) {
      if (re.test(imp.specifier)) {
        violations.push({
          ruleId: rule2.id,
          file: rel,
          line: imp.line,
          error: `${rule2.description} (forbidden import "${imp.specifier}").`,
          why: rule2.description,
          fix
        });
      }
    }
  });
  return violations;
}
function checkStoredRule(repoRoot, rule2, files) {
  if (!rule2.check) return [];
  const type = rule2.check.type ?? "text";
  if (type === "layer-order") return [];
  if (type === "forbid-import") return checkForbidImportRule(rule2, repoRoot, files);
  return checkTextRule(rule2, repoRoot, files);
}
function runAllRules(repoRoot, files) {
  const builtIn = BUILT_IN_RULES.flatMap((r) => r.check(repoRoot, files));
  const stored = loadRulesFile(resolveProjectPaths(repoRoot).hxDir).rules.flatMap((r) => checkStoredRule(repoRoot, r, files));
  return [...builtIn, ...stored];
}
function violationSignature(v) {
  return `${v.ruleId}|${v.file}|${v.line ?? ""}`;
}
function newViolations(current, baselineSignatures) {
  return current.filter((v) => !baselineSignatures.has(violationSignature(v)));
}

// src/core/scope-drift.ts
var fs12 = __toESM(require("node:fs"), 1);
var path13 = __toESM(require("node:path"), 1);
var import_node_child_process4 = require("node:child_process");
var crypto = __toESM(require("node:crypto"), 1);
var import_picomatch2 = __toESM(require_picomatch2(), 1);
var ROOT_LAYOUT_HARNESS_FILES = /* @__PURE__ */ new Set([
  "feature_list.json",
  "claude-progress.md",
  "session-handoff.md",
  "clean-state-checklist.md",
  "quality-document.md",
  "evaluator-rubric.md",
  "AGENTS.md",
  "CLAUDE.md",
  "init.sh",
  "init.ps1"
]);
function startsWithDir(f, dir) {
  const normalized = dir.split(path13.sep).join("/").replace(/\/$/, "");
  return normalized.length > 0 && (f === normalized || f.startsWith(normalized + "/"));
}
function tryGit2(repoRoot, args) {
  try {
    return (0, import_node_child_process4.execFileSync)("git", args, { cwd: repoRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}
function getChangedFiles(repoRoot) {
  const tracked = tryGit2(repoRoot, ["diff", "--name-only", "HEAD"]);
  const staged = tryGit2(repoRoot, ["diff", "--name-only", "--cached"]);
  const untracked = tryGit2(repoRoot, ["ls-files", "--others", "--exclude-standard"]);
  const all = new Set(
    [...tracked.split("\n"), ...staged.split("\n"), ...untracked.split("\n")].map((l) => l.trim()).filter(Boolean)
  );
  return [...all];
}
function verificationFingerprint(repoRoot) {
  const resolved = path13.resolve(repoRoot);
  const changed = getChangedFiles(resolved).filter((f) => !isHarnessBookkeepingFile(resolved, f)).sort();
  const hash = crypto.createHash("sha1");
  for (const f of changed) {
    hash.update(f).update("\n");
    try {
      hash.update(fs12.readFileSync(path13.join(resolved, ...f.split("/"))));
    } catch {
      hash.update("<unreadable-or-deleted>");
    }
    hash.update("\n---\n");
  }
  return hash.digest("hex");
}
function isHarnessBookkeepingFile(repoRoot, f) {
  const paths = resolveProjectPaths(repoRoot);
  const relHxDir = path13.relative(paths.root, paths.hxDir);
  const relIssuesDir = path13.relative(paths.root, paths.issuesDir);
  return ROOT_LAYOUT_HARNESS_FILES.has(f) || startsWithDir(f, relHxDir) || startsWithDir(f, relIssuesDir) || paths.layout === "kit" && startsWithDir(f, ".claude");
}
function checkDrift(repoRoot, feature2) {
  const changedFiles = getChangedFiles(repoRoot).filter((f) => !isHarnessBookkeepingFile(repoRoot, f));
  if (feature2.scope.length === 0) {
    return { changedFiles, inScope: changedFiles, outOfScope: [], hasDrift: false };
  }
  const isMatch = (0, import_picomatch2.default)(feature2.scope);
  const inScope = changedFiles.filter((f) => isMatch(f));
  const outOfScope = changedFiles.filter((f) => !isMatch(f));
  return { changedFiles, inScope, outOfScope, hasDrift: outOfScope.length > 0 };
}
function formatDrift(result, work, kind = "feature") {
  const lines = [];
  lines.push(`Active ${kind}: ${work.id} (scope: ${work.scope.join(", ") || "undeclared"})`);
  lines.push(`Changed files: ${result.changedFiles.length}`);
  if (result.outOfScope.length === 0) {
    lines.push("No drift detected.");
  } else {
    lines.push(`DRIFT: ${result.outOfScope.length} file(s) changed outside declared scope:`);
    for (const f of result.outOfScope) lines.push(`  - ${f}`);
  }
  return lines.join("\n");
}

// src/issues/store.ts
var fs13 = __toESM(require("node:fs"), 1);
var path14 = __toESM(require("node:path"), 1);
var ISSUE_STATUSES = [
  "open",
  "triaged",
  "in_progress",
  "resolved-pending-review",
  "closed",
  "wontfix"
];
var ISSUE_SOURCES = ["manual", "test-failure", "cleanup", "rule-violation", "todo-marker"];
var IssueFrontmatter = external_exports.object({
  id: external_exports.string(),
  title: external_exports.string().min(1),
  status: external_exports.enum(ISSUE_STATUSES).default("open"),
  severity: external_exports.enum(["critical", "high", "medium", "low"]).default("medium"),
  skill: external_exports.string().default(""),
  scope: external_exports.array(external_exports.string()).default([]),
  verification: external_exports.array(external_exports.string()).default([]),
  source: external_exports.enum(ISSUE_SOURCES).default("manual"),
  signature: external_exports.string().optional(),
  // dedupe key for detect.ts
  featureId: external_exports.string().optional(),
  attempts: external_exports.number().int().default(0),
  createdAt: external_exports.string(),
  updatedAt: external_exports.string(),
  /** Lecture 11's sprint contract hash — same mechanism as Feature.contractHash (core/contract.ts),
   *  written at `hx issue start` time. */
  contractHash: external_exports.string().optional(),
  /** Phase 7: a golden journey (docs/RELIABILITY.md) name — when set, `hx issue verify` runs it
   *  after the issue's own verification commands pass, and only advances the issue to
   *  resolved-pending-review if the journey is also deterministic and passing. */
  journey: external_exports.string().optional()
});
var FRONTMATTER_RE = /^<!--hx-issue\n([\s\S]*?)\n-->\n?/;
var IssueStoreError = class extends Error {
};
function issuesDir(targetDir) {
  return resolveProjectPaths(targetDir).issuesDir;
}
function issuePath(targetDir, id) {
  return path14.join(issuesDir(targetDir), `${id}.md`);
}
function serializeIssue(issue2) {
  const fm = JSON.stringify(issue2.frontmatter, null, 2);
  return `<!--hx-issue
${fm}
-->

${issue2.body.trimEnd()}
`;
}
function parseIssue(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new IssueStoreError("Issue file is missing its <!--hx-issue ... --> frontmatter block.");
  }
  const raw = JSON.parse(match[1]);
  const frontmatter = IssueFrontmatter.parse(raw);
  const body = content.slice(match[0].length);
  return { frontmatter, body };
}
function nextIssueId(targetDir) {
  const dir = issuesDir(targetDir);
  if (!fs13.existsSync(dir)) return "ISSUE-0001";
  const nums = fs13.readdirSync(dir).map((f) => f.match(/^ISSUE-(\d+)\.md$/)).filter((m) => m !== null).map((m) => parseInt(m[1], 10));
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `ISSUE-${String(next).padStart(4, "0")}`;
}
function createIssue(targetDir, input) {
  const dir = issuesDir(targetDir);
  fs13.mkdirSync(dir, { recursive: true });
  const id = nextIssueId(targetDir);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const issue2 = {
    frontmatter: IssueFrontmatter.parse({
      id,
      title: input.title,
      status: "open",
      severity: input.severity ?? "medium",
      skill: input.skill ?? "",
      scope: input.scope ?? [],
      verification: input.verification ?? [],
      source: input.source ?? "manual",
      signature: input.signature,
      featureId: input.featureId,
      journey: input.journey,
      attempts: 0,
      createdAt: now,
      updatedAt: now
    }),
    body: input.body ?? "## Repro\n\n## Expected\n\n## Actual\n\n## Log\n"
  };
  fs13.writeFileSync(issuePath(targetDir, id), serializeIssue(issue2), "utf-8");
  return issue2;
}
function getIssue(targetDir, id) {
  const p = issuePath(targetDir, id);
  if (!fs13.existsSync(p)) throw new IssueStoreError(`No such issue: ${id}`);
  return parseIssue(fs13.readFileSync(p, "utf-8"));
}
function saveIssue(targetDir, issue2) {
  issue2.frontmatter.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  fs13.writeFileSync(issuePath(targetDir, issue2.frontmatter.id), serializeIssue(issue2), "utf-8");
}
var lastSkipped = [];
function skippedIssueFiles() {
  return lastSkipped;
}
function listIssues(targetDir, filter) {
  const dir = issuesDir(targetDir);
  lastSkipped = [];
  if (!fs13.existsSync(dir)) return [];
  const issues = [];
  for (const f of fs13.readdirSync(dir)) {
    if (!/^ISSUE-\d+\.md$/.test(f)) continue;
    try {
      issues.push(parseIssue(fs13.readFileSync(path14.join(dir, f), "utf-8")));
    } catch (err) {
      lastSkipped.push({ file: f, error: err.message });
    }
  }
  issues.sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id));
  return filter?.status ? issues.filter((i) => i.frontmatter.status === filter.status) : issues;
}
function findBySignature(targetDir, signature) {
  return listIssues(targetDir).find((i) => i.frontmatter.signature === signature);
}
var SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
function formatIssueList(issues, max) {
  const lines = [];
  if (issues.length === 0) {
    lines.push("No issues.");
  } else {
    const sorted = max !== void 0 ? [...issues].sort((a, b) => SEVERITY_ORDER[a.frontmatter.severity] - SEVERITY_ORDER[b.frontmatter.severity]) : issues;
    const shown = max !== void 0 ? sorted.slice(0, max) : sorted;
    for (const i of shown) {
      const f = i.frontmatter;
      lines.push(`[${f.status.padEnd(24)}] ${f.id}  (${f.severity})  ${f.title}`);
    }
    const hidden = issues.length - shown.length;
    if (hidden > 0) lines.push(`  \u2026 and ${hidden} more \u2014 hx issue list`);
  }
  for (const s of skippedIssueFiles()) {
    lines.push(`[UNREADABLE] ${s.file} \u2014 ${s.error}`);
  }
  return lines.join("\n");
}
function formatIssue(issue2) {
  const f = issue2.frontmatter;
  const lines = [
    `${f.id}: ${f.title}`,
    `status=${f.status} severity=${f.severity} source=${f.source} skill=${f.skill || "(unrouted)"} attempts=${f.attempts}`,
    `scope: ${f.scope.join(", ") || "(none)"}`,
    `verification: ${f.verification.join(" && ") || "(none)"}`,
    f.featureId ? `linked feature: ${f.featureId}` : "",
    "",
    issue2.body.trim()
  ];
  return lines.filter((l) => l !== "").join("\n");
}

// src/kit/drift.ts
var fs14 = __toESM(require("node:fs"), 1);
function activeScopeSource(targetDir) {
  const paths = resolveProjectPaths(targetDir);
  if (fs14.existsSync(paths.featureListPath)) {
    const active = activeFeature(loadFeatureList(paths.featureListPath));
    if (active) {
      return { kind: "feature", id: active.id, title: active.title, scope: active.scope };
    }
  }
  const inProgress = listIssues(targetDir, { status: "in_progress" });
  const issue2 = inProgress[0];
  if (issue2) {
    return {
      kind: "issue",
      id: issue2.frontmatter.id,
      title: issue2.frontmatter.title,
      scope: issue2.frontmatter.scope
    };
  }
  return null;
}
function cmdDrift(targetDir) {
  const source = activeScopeSource(targetDir);
  if (!source) {
    throw new FeatureListError(
      "Nothing is in progress \u2014 no active feature and no issue in_progress, so there is no declared scope to check against."
    );
  }
  const paths = resolveProjectPaths(targetDir);
  return { source, result: checkDrift(paths.root, { id: source.id, scope: source.scope }) };
}

// src/kit/instruction-lint.ts
var fs15 = __toESM(require("node:fs"), 1);
var path15 = __toESM(require("node:path"), 1);
var HARD_LINE_LIMIT = 200;
var WARN_LINE_LIMIT = 100;
var MAX_HARD_RULES = 15;
var TOPIC_DOC_WARN_LIMIT = 150;
var LAST_VERIFIED_STALE_DAYS = 90;
var DEFAULT_REQUIRED_SECTIONS = [
  { name: "repository purpose / scope", re: /purpose|overview|this (repository|project|repo)|a repository/i },
  { name: "startup path", re: /startup|start.?up|hx start|getting started|operating loop|session start/i },
  { name: "verification path", re: /verif|hx verify|\btest(ing)?\b/i },
  { name: "non-negotiable constraints", re: /\brules\b|constraints|must not|do not\b/i },
  {
    name: "required state artifacts",
    re: /required (files|artifacts)|feature_list\.json|claude-progress\.md|\.claude\/state|hx\.config\.json/i
  },
  { name: "end-of-session rules", re: /end of session|before you stop|session end|hx exit|hx handoff/i }
];
var HARD_RULES_HEADING_RE = /^#+\s*.*(hard rules|hard constraints|non-negotiable|\brules\b|constraints).*$/im;
function findHardRulesSection(content, headingRe) {
  const lines = content.split("\n");
  const headingIdx = lines.findIndex((l) => headingRe.test(l));
  if (headingIdx === -1) return { headingIdx: -1, bulletLines: [] };
  const bullets = [];
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#+\s/.test(line)) break;
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      bullets.push(line);
    } else if (bullets.length > 0 && line.trim() !== "") {
      bullets[bullets.length - 1] += " " + line.trim();
    }
  }
  return { headingIdx, bulletLines: bullets };
}
var SOURCE_CITATION_RE = /\(source:\s*[^)]+\)/i;
function findUncitedHardRules(bulletLines) {
  return bulletLines.filter((line) => !SOURCE_CITATION_RE.test(line)).map((line) => line.trim());
}
function hardRulesHeadingInMiddleThird(headingIdx, totalLines) {
  if (headingIdx === -1 || totalLines === 0) return false;
  const third = totalLines / 3;
  return headingIdx >= third && headingIdx < 2 * third;
}
var LAST_VERIFIED_RE = /last_verified:\s*(\d{4}-\d{2}-\d{2})/i;
function findStaleLastVerified(content) {
  const m = content.match(LAST_VERIFIED_RE);
  if (!m) return null;
  const stamp = new Date(m[1]);
  if (Number.isNaN(stamp.getTime())) return null;
  const ageDays = (Date.now() - stamp.getTime()) / 864e5;
  return ageDays > LAST_VERIFIED_STALE_DAYS ? m[1] : null;
}
function findBrokenRelativeLinks(content, fileDir) {
  const broken = [];
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const m of content.matchAll(linkRe)) {
    const target = m[1].trim();
    if (!target || target.startsWith("#")) continue;
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith("mailto:")) continue;
    const withoutAnchor = target.split("#")[0];
    if (!withoutAnchor) continue;
    const resolved = path15.resolve(fileDir, withoutAnchor);
    if (!fs15.existsSync(resolved)) broken.push(target);
  }
  return broken;
}
var BULLET_LINE_RE = /^\s*(?:[-*]|\d+\.)\s+(.+)$/;
var MIN_DUPLICATE_BULLET_LENGTH = 25;
function findDuplicateBulletsAcrossLinkedDocs(content, fileDir) {
  const rootBullets = /* @__PURE__ */ new Set();
  for (const line of content.split("\n")) {
    const m = line.match(BULLET_LINE_RE);
    if (m && m[1].trim().length >= MIN_DUPLICATE_BULLET_LENGTH) rootBullets.add(m[1].trim());
  }
  if (rootBullets.size === 0) return [];
  const duplicates = [];
  const linkRe = /\[[^\]]*\]\(([^)]+\.md)\)/g;
  const seenDocs = /* @__PURE__ */ new Set();
  for (const m of content.matchAll(linkRe)) {
    const target = m[1].split("#")[0].trim();
    if (!target || /^[a-z]+:\/\//i.test(target) || seenDocs.has(target)) continue;
    seenDocs.add(target);
    const resolved = path15.resolve(fileDir, target);
    let docContent;
    try {
      docContent = fs15.readFileSync(resolved, "utf-8");
    } catch {
      continue;
    }
    for (const line of docContent.split("\n")) {
      const dm = line.match(BULLET_LINE_RE);
      if (dm && rootBullets.has(dm[1].trim())) duplicates.push(dm[1].trim());
    }
  }
  return duplicates;
}
function lintInstructionFile(content, fileDir, fileName, opts = {}) {
  const findings = [];
  const lineCount = content.split("\n").length;
  if (lineCount > HARD_LINE_LIMIT) {
    findings.push({
      severity: "error",
      message: `${fileName} is ${lineCount} lines (hard limit ${HARD_LINE_LIMIT}). Split detail into docs/ and link from here \u2014 Lecture 4's own refactor trigger.`
    });
  } else if (lineCount > WARN_LINE_LIMIT) {
    findings.push({
      severity: "warning",
      message: `${fileName} is ${lineCount} lines (course guidance: keep it under ~${WARN_LINE_LIMIT} lines \u2014 a directory page, not an encyclopedia).`
    });
  }
  const { headingIdx, bulletLines } = findHardRulesSection(content, HARD_RULES_HEADING_RE);
  if (bulletLines.length > MAX_HARD_RULES) {
    findings.push({
      severity: "error",
      message: `${fileName} has ${bulletLines.length} hard rules under its rules/constraints heading (limit ${MAX_HARD_RULES}). Demote the least-critical ones to a topic doc.`
    });
  }
  if (hardRulesHeadingInMiddleThird(headingIdx, lineCount)) {
    findings.push({
      severity: "warning",
      message: `${fileName}'s hard-rules heading (line ${headingIdx + 1} of ${lineCount}) sits in the document's middle third \u2014 front-load constraints near the top (or keep them as a clearly-final section) so they aren't skimmed past.`
    });
  }
  const uncited = findUncitedHardRules(bulletLines);
  if (uncited.length > 0) {
    findings.push({
      severity: "warning",
      message: `${fileName} has ${uncited.length} hard rule(s) with no "(source: ...)" citation \u2014 an unfalsifiable rule can't be checked or revisited. First: "${uncited[0].slice(0, 80)}"`
    });
  }
  const staleDate = findStaleLastVerified(content);
  if (staleDate) {
    findings.push({
      severity: "warning",
      message: `${fileName}'s last_verified: ${staleDate} is over ${LAST_VERIFIED_STALE_DAYS} days old \u2014 re-verify the claims below it and bump the date, or remove the marker if it no longer applies.`
    });
  }
  const sections = opts.instructionSections ? opts.instructionSections.map((s) => ({ name: s.name, re: new RegExp(s.pattern, "i") })) : DEFAULT_REQUIRED_SECTIONS;
  for (const section of sections) {
    if (!section.re.test(content)) {
      findings.push({
        severity: "warning",
        message: `${fileName} appears to be missing "${section.name}" (${opts.instructionSections ? "this project's instructionSections config" : `prompt-calibration.md's "Keep In The Root File" list`}).`
      });
    }
  }
  const brokenLinks = findBrokenRelativeLinks(content, fileDir);
  if (brokenLinks.length > 0) {
    findings.push({
      severity: "error",
      message: `${fileName} has ${brokenLinks.length} broken relative link(s): ${brokenLinks.join(", ")}`
    });
  }
  const duplicates = findDuplicateBulletsAcrossLinkedDocs(content, fileDir);
  if (duplicates.length > 0) {
    findings.push({
      severity: "warning",
      message: `${fileName} has ${duplicates.length} bullet(s) duplicated verbatim in a linked topic doc \u2014 state it once, link to it, don't maintain two copies. First: "${duplicates[0].slice(0, 80)}"`
    });
  }
  return findings;
}
function lintLinkedTopicDocs(content, fileDir) {
  const findings = [];
  const linkRe = /\[[^\]]*\]\(([^)]+\.md)\)/g;
  const seen = /* @__PURE__ */ new Set();
  for (const m of content.matchAll(linkRe)) {
    const target = m[1].split("#")[0].trim();
    if (!target || /^[a-z]+:\/\//i.test(target) || seen.has(target)) continue;
    seen.add(target);
    const resolved = path15.resolve(fileDir, target);
    if (!fs15.existsSync(resolved)) continue;
    let lines;
    try {
      lines = fs15.readFileSync(resolved, "utf-8").split("\n").length;
    } catch {
      continue;
    }
    if (lines > TOPIC_DOC_WARN_LIMIT) {
      findings.push({
        severity: "warning",
        message: `Linked topic doc ${target} is ${lines} lines (course guidance: 50-150 lines per topic doc).`
      });
    }
  }
  return findings;
}
function formatLintFindings(findings) {
  return findings.map((f) => `[${f.severity.toUpperCase()}] ${f.message}`);
}
var SUBDIR_WALK_EXCLUDED = ["node_modules", ".git", "dist", "build", ".hx", ".claude", "coverage"];
function lintSubdirectoryInstructionFiles(repoRoot) {
  const findings = [];
  function walk2(dir) {
    let entries;
    try {
      entries = fs15.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path15.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SUBDIR_WALK_EXCLUDED.includes(entry.name)) continue;
        walk2(full);
      } else if (dir !== repoRoot && (entry.name === "CLAUDE.md" || entry.name === "AGENTS.md")) {
        let lines;
        try {
          lines = fs15.readFileSync(full, "utf-8").split("\n").length;
        } catch {
          continue;
        }
        if (lines > WARN_LINE_LIMIT) {
          const rel = path15.relative(repoRoot, full).replace(/\\/g, "/");
          findings.push({
            severity: "warning",
            message: `${rel} is ${lines} lines (course guidance: keep it under ~${WARN_LINE_LIMIT} lines, same as the root file \u2014 a subdirectory instruction file is not exempt).`
          });
        }
      }
    }
  }
  walk2(repoRoot);
  return findings;
}

// src/kit/advanced-checks.ts
var fs18 = __toESM(require("node:fs"), 1);
var path18 = __toESM(require("node:path"), 1);
var import_picomatch3 = __toESM(require_picomatch2(), 1);

// src/kit/plan.ts
var fs16 = __toESM(require("node:fs"), 1);
var path16 = __toESM(require("node:path"), 1);
var CURRENT_STEP_MARKER = "[CURRENT]";
var DEFERRED_STEP_MARKER = "[DEFERRED]";
var PLAN_SECTIONS = ["Objective", "Scope And Out-Of-Scope", "Verification Path", "Risks And Blockers", "Progress Log", "Open Decisions"];
function slugify(topic) {
  const slug = topic.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length === 0) throw new FeatureListError(`ERROR: "${topic}" has no usable characters for a plan filename.
FIX: pick a topic with at least one letter or digit.`);
  return slug;
}
function activeDir(root) {
  return path16.join(root, "docs", "exec-plans", "active");
}
function completedDir(root) {
  return path16.join(root, "docs", "exec-plans", "completed");
}
function techDebtTrackerPath(root) {
  return path16.join(root, "docs", "exec-plans", "tech-debt-tracker.md");
}
function activePlanPaths(root) {
  const dir = activeDir(root);
  if (!fs16.existsSync(dir)) return [];
  return fs16.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "index.md").map((f) => path16.join(dir, f));
}
function renderPlan(topic, date) {
  return [
    `# ${topic}`,
    "",
    `Created: ${date}`,
    "",
    "## Objective",
    "",
    "`[what this plan accomplishes and why it needs a plan, not just a feature]`",
    "",
    "## Scope And Out-Of-Scope",
    "",
    "In scope:",
    "- `[...]`",
    "",
    "Out of scope:",
    "- `[...]`",
    "",
    "## Verification Path",
    "",
    "`[how each step's result is verified \u2014 the actual command(s), not a description of testing]`",
    "",
    "## Risks And Blockers",
    "",
    "- `[...]`",
    "",
    "## Progress Log",
    "",
    `- ${date}: ${CURRENT_STEP_MARKER} plan created, not yet started`,
    "",
    "## Open Decisions",
    "",
    "- `[...]`",
    ""
  ].join("\n");
}
function cmdPlanNew(targetDir, topic) {
  const paths = resolveProjectPaths(targetDir);
  const slug = slugify(topic);
  const fileName = `${todayISO()}-${slug}.md`;
  const filePath = path16.join(activeDir(paths.root), fileName);
  if (fs16.existsSync(filePath)) {
    throw new FeatureListError(`ERROR: a plan already exists at docs/exec-plans/active/${fileName}.
FIX: open and continue that plan, or pick a different topic.`);
  }
  fs16.mkdirSync(path16.dirname(filePath), { recursive: true });
  fs16.writeFileSync(filePath, renderPlan(topic, todayISO()), "utf-8");
  const relPath = path16.posix.join("docs", "exec-plans", "active", fileName);
  new EventLog(paths.hxDir).append("plan.new", { relPath, topic });
  return { filePath, relPath };
}
function resolveActivePlan(root, planRef) {
  const base = path16.basename(planRef);
  const candidate = path16.join(activeDir(root), base);
  if (fs16.existsSync(candidate)) return candidate;
  throw new FeatureListError(
    `ERROR: no active plan matching "${planRef}" found under docs/exec-plans/active/.
FIX: check the filename with \`hx plan list\`, or run \`hx plan new <topic>\` if it was never created.`
  );
}
function cmdPlanDone(targetDir, planRef) {
  const paths = resolveProjectPaths(targetDir);
  const from = resolveActivePlan(paths.root, planRef);
  const fileName = path16.basename(from);
  const to = path16.join(completedDir(paths.root), fileName);
  fs16.mkdirSync(path16.dirname(to), { recursive: true });
  fs16.renameSync(from, to);
  new EventLog(paths.hxDir).append("plan.done", { fileName });
  return { from, to };
}
function cmdPlanList(targetDir) {
  const paths = resolveProjectPaths(targetDir);
  const list = (dir) => fs16.existsSync(dir) ? fs16.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "index.md").sort() : [];
  return { active: list(activeDir(paths.root)), completed: list(completedDir(paths.root)) };
}
function planHasTodayProgress(filePath) {
  if (!fs16.existsSync(filePath)) return false;
  const content = fs16.readFileSync(filePath, "utf-8");
  return content.includes(`- ${todayISO()}:`);
}
function countCurrentStepMarkers(filePath) {
  if (!fs16.existsSync(filePath)) return 0;
  const content = fs16.readFileSync(filePath, "utf-8");
  return (content.match(new RegExp(CURRENT_STEP_MARKER.replace(/[[\]]/g, "\\$&"), "g")) ?? []).length;
}
function planHasEverySection(filePath) {
  const content = fs16.existsSync(filePath) ? fs16.readFileSync(filePath, "utf-8") : "";
  const missing = PLAN_SECTIONS.filter((s) => !content.includes(`## ${s}`));
  return { ok: missing.length === 0, missing };
}

// src/kit/journey.ts
var fs17 = __toESM(require("node:fs"), 1);
var path17 = __toESM(require("node:path"), 1);
var import_node_child_process5 = require("node:child_process");
function reliabilityPath(root) {
  return path17.join(root, "docs", "RELIABILITY.md");
}
function parseGoldenJourneys(root) {
  const full = reliabilityPath(root);
  if (!fs17.existsSync(full)) return [];
  const content = fs17.readFileSync(full, "utf-8");
  const start = content.indexOf("## Golden Journeys");
  if (start === -1) return [];
  const nextHeading = content.indexOf("\n## ", start + 1);
  const section = content.slice(start, nextHeading === -1 ? content.length : nextHeading);
  const journeys = [];
  for (const line of section.split("\n")) {
    const cells = line.match(/^\|(.+)\|\s*$/)?.[1]?.split("|").map((c) => c.trim().replace(/^`|`$/g, ""));
    if (!cells || cells.length < 3) continue;
    if (/^---+$/.test(cells[0]) || cells[0] === "Journey") continue;
    if (cells[0].includes("[") || cells[1].includes("[")) continue;
    journeys.push({ name: cells[0], command: cells[1], signal: cells[2] });
  }
  return journeys;
}
function hasOnlyPlaceholderJourneys(root) {
  const full = reliabilityPath(root);
  if (!fs17.existsSync(full)) return false;
  const content = fs17.readFileSync(full, "utf-8");
  return content.includes("## Golden Journeys") && parseGoldenJourneys(root).length === 0;
}
function runOnce(cmd, cwd, timeoutMs) {
  try {
    const output = (0, import_node_child_process5.execSync)(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    return { exitCode: 0, output };
  } catch (err) {
    const exitCode = typeof err.status === "number" ? err.status : 1;
    return { exitCode, output: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}
function cmdJourneyRun(targetDir, name, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const journeys = parseGoldenJourneys(paths.root);
  if (journeys.length === 0) {
    throw new FeatureListError(
      `ERROR: no golden journeys configured.
WHY: hx journey run reads the Golden Journeys table in docs/RELIABILITY.md.
FIX: hx init --advanced (if you haven't), then fill in a row: | name | command | signal |.`
    );
  }
  const targets = name ? journeys.filter((j) => j.name === name) : journeys;
  if (name && targets.length === 0) {
    throw new FeatureListError(`ERROR: no golden journey named "${name}".
FIX: hx journey run with no name to see them all, or check docs/RELIABILITY.md.`);
  }
  const timeoutMs = opts.timeoutMs ?? paths.kitConfig?.verifyTimeoutMs ?? 6e5;
  const eventLog = new EventLog(paths.hxDir);
  const results = [];
  for (const journey2 of targets) {
    const first = runOnce(journey2.command, paths.root, timeoutMs);
    const second = runOnce(journey2.command, paths.root, timeoutMs);
    const deterministic = first.exitCode === second.exitCode;
    const passed = deterministic && first.exitCode === 0;
    if (opts.captureDir) {
      const dir = path17.join(opts.captureDir, journey2.name);
      fs17.mkdirSync(dir, { recursive: true });
      fs17.writeFileSync(path17.join(dir, "before.txt"), first.output, "utf-8");
      fs17.writeFileSync(path17.join(dir, "after.txt"), second.output, "utf-8");
    }
    eventLog.append("journey.run", {
      name: journey2.name,
      command: journey2.command,
      firstExitCode: first.exitCode,
      secondExitCode: second.exitCode,
      deterministic,
      passed
    });
    results.push({ name: journey2.name, command: journey2.command, firstExitCode: first.exitCode, secondExitCode: second.exitCode, deterministic, passed });
  }
  return results;
}
function formatJourneyResults(results) {
  const lines = [];
  for (const r of results) {
    const status = r.passed ? "PASS" : !r.deterministic ? "FLAKY" : "FAIL";
    lines.push(`[${status}] ${r.name} \u2014 run 1: exit ${r.firstExitCode}, run 2: exit ${r.secondExitCode}`);
  }
  return lines.join("\n");
}

// src/kit/advanced-checks.ts
function planRel(root, planPath) {
  return toPosix(path18.relative(root, planPath));
}
function planStopAdvisories(paths, dirty) {
  const advisories = [];
  const trackerContent = fs18.existsSync(techDebtTrackerPath(paths.root)) ? fs18.readFileSync(techDebtTrackerPath(paths.root), "utf-8") : "";
  for (const planPath of activePlanPaths(paths.root)) {
    const rel = planRel(paths.root, planPath);
    const content = fs18.readFileSync(planPath, "utf-8");
    if (dirty && !planHasTodayProgress(planPath)) {
      advisories.push(`${rel}: uncommitted changes, but no progress-log entry dated today.`);
    }
    if (countCurrentStepMarkers(planPath) === 0) {
      advisories.push(`${rel}: no ${CURRENT_STEP_MARKER} step marker \u2014 if the plan is finished, run \`hx plan done\`; if not, mark the step in progress.`);
    }
    if (content.includes(DEFERRED_STEP_MARKER) && !trackerContent.includes(path18.basename(planPath))) {
      advisories.push(`${rel}: has a ${DEFERRED_STEP_MARKER} step with no matching row in docs/exec-plans/tech-debt-tracker.md.`);
    }
  }
  return advisories;
}
function decisionStopAdvisory(paths, changedFiles) {
  const decisionsRel = toPosix(path18.relative(paths.root, paths.decisionsPath));
  if (!changedFiles.includes(decisionsRel)) return null;
  const otherDocsChanged = changedFiles.some((f) => f !== decisionsRel && f.startsWith("docs/"));
  if (otherDocsChanged) return null;
  return `${decisionsRel} changed, but no other file under docs/** changed alongside it \u2014 a decision without an encoded consequence is easy to lose. See docs/sops (encode-knowledge-into-repo) if a real doc should carry this.`;
}
var PLACEHOLDER_PATTERN = /`\[[^`\]]+\]`/g;
function checkPlaceholders(root) {
  const offenders = [];
  for (const relPath of advancedTemplatePaths()) {
    const full = path18.join(root, ...relPath.split("/"));
    if (!fs18.existsSync(full)) continue;
    const matches = fs18.readFileSync(full, "utf-8").match(PLACEHOLDER_PATTERN);
    if (matches && matches.length > 0) offenders.push(`${relPath} (${matches.length})`);
  }
  return offenders.length === 0 ? { name: "Advanced-pack placeholders filled in", status: "PASS", detail: "No unfilled `[...]` placeholders in vendored docs." } : { name: "Advanced-pack placeholders filled in", status: "WARN", detail: `Still has placeholders: ${offenders.join(", ")}` };
}
function checkPlanHeadingsAndMarkers(root) {
  const problems = [];
  for (const planPath of activePlanPaths(root)) {
    const rel = planRel(root, planPath);
    const { ok, missing } = planHasEverySection(planPath);
    if (!ok) problems.push(`${rel}: missing section(s) ${missing.join(", ")}`);
    const markers = countCurrentStepMarkers(planPath);
    if (markers !== 1) problems.push(`${rel}: ${markers} ${CURRENT_STEP_MARKER} markers (expected exactly 1)`);
  }
  return problems.length === 0 ? { name: "Active plans well-formed", status: "PASS", detail: "Every active plan has all six sections and exactly one current-step marker." } : { name: "Active plans well-formed", status: "WARN", detail: problems.join("; ") };
}
function checkDesignDocsIndex(root) {
  const dir = path18.join(root, "docs", "design-docs");
  const indexPath = path18.join(dir, "index.md");
  if (!fs18.existsSync(dir)) return { name: "design-docs/index.md covers every file", status: "PASS", detail: "No docs/design-docs/ directory." };
  const indexContent = fs18.existsSync(indexPath) ? fs18.readFileSync(indexPath, "utf-8") : "";
  const files = fs18.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "index.md");
  const uncovered = files.filter((f) => !indexContent.includes(f));
  return uncovered.length === 0 ? { name: "design-docs/index.md covers every file", status: "PASS", detail: `All ${files.length} design doc(s) listed in the index.` } : { name: "design-docs/index.md covers every file", status: "WARN", detail: `Not referenced in docs/design-docs/index.md: ${uncovered.join(", ")}` };
}
var VALID_GRADES = /* @__PURE__ */ new Set(["A", "B", "C", "D", "-"]);
function gradedSection(content, heading, nextHeading) {
  const start = content.indexOf(heading);
  if (start === -1) return "";
  const end = content.indexOf(nextHeading, start);
  return content.slice(start, end === -1 ? content.length : end);
}
function checkQualityScoreColumns(paths) {
  if (!fs18.existsSync(paths.qualityDocPath)) return { name: "QUALITY_SCORE.md columns and enums", status: "PASS", detail: "No quality document yet." };
  const content = fs18.readFileSync(paths.qualityDocPath, "utf-8");
  const section = gradedSection(content, "## Product Domains", "## Architectural Layers") + gradedSection(content, "## Architectural Layers", "## Benchmark Snapshots");
  const badGrades = [];
  for (const line of section.split("\n")) {
    const cells = line.match(/^\|(.+)\|\s*$/)?.[1]?.split("|").map((c) => c.trim());
    if (!cells || cells.length < 2) continue;
    if (/^---+$/.test(cells[0]) || cells[0] === "Domain" || cells[0] === "Layer") continue;
    const grade = cells[1];
    if (grade !== void 0 && grade.length > 0 && !VALID_GRADES.has(grade)) badGrades.push(`"${cells[0]}": ${grade}`);
  }
  return badGrades.length === 0 ? { name: "QUALITY_SCORE.md columns and enums", status: "PASS", detail: "Every grade cell is one of A/B/C/D/-." } : { name: "QUALITY_SCORE.md columns and enums", status: "WARN", detail: `Invalid grade value(s): ${badGrades.join(", ")}` };
}
function checkSpecFreshness(paths) {
  if (!fs18.existsSync(paths.featureListPath)) return { name: "Product spec kept current with its feature", status: "PASS", detail: "No feature list yet." };
  const doc = loadFeatureList(paths.featureListPath);
  const feature2 = activeFeature(doc);
  if (!feature2?.spec) return { name: "Product spec kept current with its feature", status: "PASS", detail: "No active feature with a spec: field." };
  const changed = getChangedFiles(paths.root);
  const isInScope = feature2.scope.length > 0 ? (0, import_picomatch3.default)(feature2.scope) : () => false;
  const scopeChanged = changed.some((f) => isInScope(f));
  const specChanged = changed.includes(feature2.spec);
  if (scopeChanged && !specChanged) {
    return {
      name: "Product spec kept current with its feature",
      status: "WARN",
      detail: `"${feature2.id}" changed code in its scope this session but not its named spec (${feature2.spec}).`
    };
  }
  return { name: "Product spec kept current with its feature", status: "PASS", detail: "Spec and scope changes are consistent, or nothing changed." };
}
function checkDuplicateFacts(root) {
  const docsDir = path18.join(root, "docs");
  if (!fs18.existsSync(docsDir)) return { name: "No duplicated facts across docs/**", status: "PASS", detail: "No docs/ directory." };
  const seen = /* @__PURE__ */ new Map();
  const walk2 = (dir) => {
    for (const entry of fs18.readdirSync(dir, { withFileTypes: true })) {
      const full = path18.join(dir, entry.name);
      if (entry.isDirectory()) walk2(full);
      else if (entry.name.endsWith(".md")) {
        const rel = toPosix(path18.relative(root, full));
        for (const line of fs18.readFileSync(full, "utf-8").split("\n")) {
          const bullet = line.trim();
          if (!bullet.startsWith("-") && !bullet.startsWith("*")) continue;
          const fact = bullet.replace(/^[-*]\s*/, "").toLowerCase();
          if (fact.length < 20 || /^`?\[.*\]`?\.?$/.test(fact)) continue;
          const files = seen.get(fact) ?? /* @__PURE__ */ new Set();
          files.add(rel);
          seen.set(fact, files);
        }
      }
    }
  };
  walk2(docsDir);
  const duplicates = [...seen.entries()].filter(([, files]) => files.size > 1).slice(0, 5);
  return duplicates.length === 0 ? { name: "No duplicated facts across docs/**", status: "PASS", detail: "No identical bullet lines repeated across multiple docs files." } : {
    name: "No duplicated facts across docs/**",
    status: "WARN",
    detail: duplicates.map(([fact, files]) => `"${fact.slice(0, 60)}${fact.length > 60 ? "\u2026" : ""}" in ${[...files].join(", ")}`).join("; ")
  };
}
function checkGoldenJourneys(root) {
  return hasOnlyPlaceholderJourneys(root) ? { name: "Golden journeys configured", status: "WARN", detail: "docs/RELIABILITY.md's Golden Journeys table is still the unfilled placeholder row." } : { name: "Golden journeys configured", status: "PASS", detail: "At least one real golden journey is configured, or there is no journeys table yet." };
}
function advancedDoctorChecks(paths) {
  return [
    checkPlaceholders(paths.root),
    checkPlanHeadingsAndMarkers(paths.root),
    checkDesignDocsIndex(paths.root),
    checkQualityScoreColumns(paths),
    checkSpecFreshness(paths),
    checkDuplicateFacts(paths.root),
    checkGoldenJourneys(paths.root)
  ];
}
function lowestQualityGrade(paths) {
  if (!fs18.existsSync(paths.qualityDocPath)) return null;
  const content = fs18.readFileSync(paths.qualityDocPath, "utf-8");
  const rank = { D: 1, C: 2, B: 3, A: 4 };
  let worst = null;
  for (const line of content.split("\n")) {
    const cells = line.match(/^\|(.+)\|\s*$/)?.[1]?.split("|").map((c) => c.trim());
    if (!cells || cells.length < 2) continue;
    const grade = cells[1];
    if (grade && grade in rank && (!worst || rank[grade] < rank[worst])) worst = grade;
  }
  return worst;
}

// src/core/contract.ts
var fs19 = __toESM(require("node:fs"), 1);
var path19 = __toESM(require("node:path"), 1);
var crypto2 = __toESM(require("node:crypto"), 1);
function formatVerificationEntry(v) {
  if ("cmd" in v && v.cmd) return `- [${v.level}] \`${v.cmd}\``;
  if ("manual" in v && v.manual) return `- [${v.level}] manual: ${v.manual.join("; ")}`;
  return `- [${v.level}] (unspecified)`;
}
function renderContractSections(scope, verification, exclusions) {
  const lines = [];
  lines.push("## Scope", "");
  lines.push(scope.length > 0 ? scope.map((s) => `- ${s}`).join("\n") : "- (no scope declared)");
  lines.push("", "## Verification Standards", "");
  lines.push(verification.length > 0 ? verification.map(formatVerificationEntry).join("\n") : "- (none declared)");
  lines.push("", "## Exclusions", "");
  lines.push(exclusions.length > 0 ? exclusions.map((s) => `- ${s}`).join("\n") : "- (none)");
  return lines.join("\n");
}
function hashContractSections(sections) {
  return crypto2.createHash("sha1").update(sections).digest("hex").slice(0, 16);
}
function computeExclusions(doc, excludeId, config) {
  const otherScopes = [...new Set(doc.features.filter((f) => f.id !== excludeId).flatMap((f) => f.scope))];
  return [...otherScopes, ...config?.handsOff ?? []];
}
function contractPath(root, kind, id) {
  const hxDir = resolveProjectPaths(root).hxDir;
  return path19.join(hxDir, "contracts", `${kind}-${id}.md`);
}
function writeContract(root, kind, id, title, scope, verification, exclusions) {
  const sections = renderContractSections(scope, verification, exclusions);
  const hash = hashContractSections(sections);
  const full = contractPath(root, kind, id);
  fs19.mkdirSync(path19.dirname(full), { recursive: true });
  fs19.writeFileSync(full, `# Sprint Contract: ${title}

${sections}
`, "utf-8");
  return hash;
}
function contractChanged(feature2, exclusions) {
  if (!feature2.contractHash) return false;
  const currentHash = hashContractSections(renderContractSections(feature2.scope, feature2.verification, exclusions));
  return currentHash !== feature2.contractHash;
}

// src/kit/audit.ts
var fs20 = __toESM(require("node:fs"), 1);
var path20 = __toESM(require("node:path"), 1);
function scoreFromFraction(passed, total) {
  if (total === 0) return 5;
  const frac = passed / total;
  if (frac >= 1) return 5;
  if (frac >= 0.75) return 4;
  if (frac >= 0.5) return 3;
  if (frac > 0) return 2;
  return 1;
}
var LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock", "uv.lock", "go.sum"];
function auditDocsAndInstructions(root) {
  const repoScore = scoreRepo(root);
  const relevant = repoScore.checks.filter((c) => ["AGENTS.md / CLAUDE.md", "Architecture documentation", "README"].includes(c.name));
  const repoPassed = relevant.filter((c) => c.points > 0).length;
  const candidates = ["AGENTS.md", "CLAUDE.md", path20.join(".claude", "CLAUDE.md")];
  const foundName = candidates.find((c) => fs20.existsSync(path20.join(root, c)));
  let lintErrors = 0;
  if (foundName) {
    const content = fs20.readFileSync(path20.join(root, foundName), "utf-8");
    const fileDir = path20.dirname(path20.join(root, foundName));
    const instructionSections = resolveProjectPaths(root).kitConfig?.instructionSections;
    lintErrors = [
      ...lintInstructionFile(content, fileDir, foundName, { instructionSections }),
      ...lintLinkedTopicDocs(content, fileDir)
    ].filter((f) => f.severity === "error").length;
  }
  const total = relevant.length + 1;
  const passed = repoPassed + (lintErrors === 0 ? 1 : 0);
  return {
    name: "Documentation & Instructions",
    score: scoreFromFraction(passed, total),
    detail: `${repoPassed}/${relevant.length} repo-score doc checks; ${lintErrors} instruction-lint error(s).`
  };
}
function auditStartupAndEnvironment(root) {
  const initResults = runInitChecks(root);
  const initPassed = initResults.filter((r) => r.passed).length;
  const paths = resolveProjectPaths(root);
  const commandsConfigured = Boolean(paths.kitConfig?.commands.install && paths.kitConfig?.commands.verify && paths.kitConfig?.commands.start);
  const startupScriptPresent = fs20.existsSync(path20.join(root, "init.sh")) || fs20.existsSync(path20.join(root, "init.ps1"));
  const lockfilePresent = LOCKFILES.some((f) => fs20.existsSync(path20.join(root, f)));
  const total = initResults.length + 2;
  const passed = initPassed + (commandsConfigured || startupScriptPresent ? 1 : 0) + (lockfilePresent ? 1 : 0);
  return {
    name: "Startup & Environment",
    score: scoreFromFraction(passed, total),
    detail: `${initPassed}/${initResults.length} init checks pass; startup path ${commandsConfigured || startupScriptPresent ? "present" : "MISSING"}; lockfile ${lockfilePresent ? "present" : "MISSING"}.`
  };
}
function auditVerificationAndTesting(root) {
  const repoScore = scoreRepo(root);
  const testingStructure = repoScore.checks.find((c) => c.name === "Testing structure");
  const testingOk = (testingStructure?.points ?? 0) > 0;
  const paths = resolveProjectPaths(root);
  let featuresWithVerification = 0;
  let featureCount = 0;
  if (fs20.existsSync(paths.featureListPath)) {
    const doc = loadFeatureList(paths.featureListPath);
    featureCount = doc.features.length;
    featuresWithVerification = doc.features.filter((f) => f.verification.length > 0).length;
  }
  const violations = runAllRules(root);
  const total = 1 + (featureCount > 0 ? 1 : 0) + 1;
  const passed = (testingOk ? 1 : 0) + (featureCount > 0 ? featuresWithVerification === featureCount ? 1 : 0 : 0) + (violations.length === 0 ? 1 : 0);
  return {
    name: "Verification & Testing",
    score: scoreFromFraction(passed, total),
    detail: `Testing structure ${testingOk ? "present" : "MISSING"}; ${featuresWithVerification}/${featureCount} feature(s) declare verification; ${violations.length} rule violation(s).`
  };
}
function auditWiringAndHooks(root) {
  const paths = resolveProjectPaths(root);
  if (paths.layout !== "kit") {
    return { name: "Wiring & Hooks", score: 5, detail: "Root layout \u2014 no .claude/ kit to wire; nothing to check." };
  }
  const wiring = checkKitWiring(root);
  const passed = wiring.filter((c) => c.passed).length;
  return {
    name: "Wiring & Hooks",
    score: scoreFromFraction(passed, wiring.length),
    detail: `${passed}/${wiring.length} kit-wiring checks pass.`
  };
}
function auditContinuityAndState(root) {
  const checklist = continuityChecklist(root);
  const passed = checklist.filter((c) => c.passed).length;
  const total = checklist.length + 1;
  const paths = resolveProjectPaths(root);
  let cycleOk = true;
  if (fs20.existsSync(paths.featureListPath)) {
    try {
      cycleOk = findDependencyCycle(loadFeatureList(paths.featureListPath)) === null;
    } catch {
    }
  }
  return {
    name: "Continuity & State",
    score: scoreFromFraction(passed + (cycleOk ? 1 : 0), total),
    detail: `${passed}/${checklist.length} continuity items pass; ${cycleOk ? "no" : "a"} feature dependency cycle.`
  };
}
function runAudit(targetDir) {
  const paths = resolveProjectPaths(targetDir);
  const subsystems = [
    auditDocsAndInstructions(paths.root),
    auditStartupAndEnvironment(paths.root),
    auditVerificationAndTesting(paths.root),
    auditWiringAndHooks(paths.root),
    auditContinuityAndState(paths.root)
  ];
  const lowestFirst = [...subsystems].sort((a, b) => a.score - b.score);
  const llmCalls = new EventLog(hxDirFor(paths.root)).readByType("llm.call");
  const llmUsage = llmCalls.length > 0 ? {
    calls: llmCalls.length,
    inputTokens: llmCalls.reduce((sum, e) => sum + (Number(e.inputTokens) || 0), 0),
    outputTokens: llmCalls.reduce((sum, e) => sum + (Number(e.outputTokens) || 0), 0)
  } : null;
  return { subsystems, lowestFirst, llmUsage };
}
function formatAuditReport(report) {
  const lines = ["Audit (worst first):"];
  for (const s of report.lowestFirst) lines.push(`  [${s.score}/5] ${s.name} \u2014 ${s.detail}`);
  if (report.llmUsage) {
    lines.push(
      `LLM usage (llm.call events): ${report.llmUsage.calls} call(s), ${report.llmUsage.inputTokens} input token(s), ${report.llmUsage.outputTokens} output token(s).`
    );
  }
  return lines.join("\n");
}

// src/kit/evaluate.ts
var fs21 = __toESM(require("node:fs"), 1);
var path21 = __toESM(require("node:path"), 1);

// src/core/verify-ladder.ts
var import_node_child_process6 = require("node:child_process");
var LEVEL_ORDER = ["static", "unit", "integration", "e2e"];
function runVerificationLadder(feature2, cwd, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 6e5;
  const sorted = [...feature2.verification].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
  const results = [];
  const evidence = [];
  let rootCauseLevel;
  const cascadeLevels = [];
  let stopped = false;
  for (const entry of sorted) {
    if (stopped) {
      results.push({ level: entry.level, entry, ran: false, passed: false });
      continue;
    }
    if ("manual" in entry && entry.manual) {
      if (!opts.attest) {
        results.push({ level: entry.level, entry, ran: false, passed: false, requiresAttestation: true });
        if (!rootCauseLevel) rootCauseLevel = entry.level;
        else cascadeLevels.push(entry.level);
        stopped = true;
        continue;
      }
      results.push({ level: entry.level, entry, ran: true, passed: true });
      evidence.push({
        kind: "manual-attest",
        note: opts.attestNote ?? entry.manual.join(" -> "),
        attestedBy: "human",
        testedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      continue;
    }
    if ("cmd" in entry && entry.cmd) {
      let exitCode = 0;
      let output = "";
      try {
        output = (0, import_node_child_process6.execSync)(entry.cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, killSignal: "SIGKILL" });
      } catch (err) {
        if (err?.code === "ETIMEDOUT" || err?.signal === "SIGTERM") {
          exitCode = 124;
          output = `TIMEOUT after ${timeoutMs}ms \u2014 the command did not exit on its own.
Raise verifyTimeoutMs in .claude/hx.config.json if this suite is legitimately slow, or fix whatever is hanging.
` + ((err.stdout ?? "") + (err.stderr ?? ""));
        } else {
          exitCode = typeof err.status === "number" ? err.status : 1;
          output = (err.stdout ?? "") + (err.stderr ?? "");
        }
      }
      const passed = exitCode === 0;
      results.push({ level: entry.level, entry, ran: true, passed, exitCode, output: output.slice(0, 2e3) });
      evidence.push({
        kind: "cmd",
        cmd: entry.cmd,
        exitCode,
        testedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (!passed) {
        if (!rootCauseLevel) rootCauseLevel = entry.level;
        else cascadeLevels.push(entry.level);
        stopped = true;
      }
    }
  }
  const allPassed = results.length > 0 && results.every((r) => r.passed);
  return { results, rootCauseLevel, cascadeLevels, allPassed, evidence };
}
function formatLadderResult(result) {
  const lines = [];
  for (const r of result.results) {
    if (!r.ran) {
      lines.push(`[SKIP] ${r.level}${r.requiresAttestation ? " (requires --attest, this is a manual step)" : ""}`);
      continue;
    }
    lines.push(`[${r.passed ? "PASS" : "FAIL"}] ${r.level}${r.exitCode !== void 0 ? ` (exit ${r.exitCode})` : ""}`);
  }
  if (result.rootCauseLevel) {
    lines.push(`Root cause: ${result.rootCauseLevel}`);
    if (result.cascadeLevels.length > 0) {
      lines.push(`Cascade (also failing, likely downstream of root cause): ${result.cascadeLevels.join(", ")}`);
    }
  }
  lines.push(result.allPassed ? "VERDICT: all levels passed" : "VERDICT: not passing");
  return lines.join("\n");
}

// src/kit/evaluate.ts
var QUESTIONS = {
  Correctness: "Does the implemented behavior match the requested feature?",
  Verification: "Did `hx verify` actually run, with evidence recorded?",
  "Scope discipline": "Did the session stay inside the feature's declared `scope` (`hx drift`)?",
  Reliability: "Does the result survive `hx exit` / a restart without repair?",
  Maintainability: "Is the code and documentation clear enough for the next session?",
  "Handoff readiness": "Can a fresh session continue work from `hx start` output alone?"
};
function scoreVerification(feature2) {
  if (feature2.evidence.length === 0) {
    return { category: "Verification", question: QUESTIONS.Verification, score: 0, notes: "No evidence recorded." };
  }
  const last = feature2.evidence[feature2.evidence.length - 1];
  const passed = last.kind === "manual-attest" ? true : last.exitCode === 0;
  if (passed) return { category: "Verification", question: QUESTIONS.Verification, score: 2, notes: `Last evidence: ${last.kind}, recorded ${last.testedAt}.` };
  return { category: "Verification", question: QUESTIONS.Verification, score: 1, notes: "Evidence recorded, but the last run did not pass." };
}
function scoreScopeDiscipline(root, feature2) {
  const result = checkDrift(root, { id: feature2.id, scope: feature2.scope });
  if (!result.hasDrift) return { category: "Scope discipline", question: QUESTIONS["Scope discipline"], score: 2, notes: "No drift found." };
  return {
    category: "Scope discipline",
    question: QUESTIONS["Scope discipline"],
    score: 0,
    notes: `Out-of-scope changes: ${result.outOfScope.join(", ")}`
  };
}
function scoreReliability(feature2, root, knownFirstRun) {
  const fastLevels = ["static", "unit"];
  const fastOnly = { ...feature2, verification: feature2.verification.filter((v) => fastLevels.includes(v.level)) };
  if (fastOnly.verification.length === 0) {
    return { category: "Reliability", question: QUESTIONS.Reliability, score: "n/a", notes: "No static/unit verification entries to rerun." };
  }
  const timeoutMs = resolveProjectPaths(root).kitConfig?.verifyTimeoutMs;
  const firstAllPassed = knownFirstRun ?? runVerificationLadder(fastOnly, root, { timeoutMs }).allPassed;
  const second = runVerificationLadder(fastOnly, root, { timeoutMs });
  if (firstAllPassed === second.allPassed) {
    return {
      category: "Reliability",
      question: QUESTIONS.Reliability,
      score: firstAllPassed ? 2 : 0,
      notes: `${knownFirstRun !== void 0 ? "Reused the just-run" : "Reran"} static/unit result and reran once more, consistent: ${firstAllPassed ? "pass" : "fail"} both times.`
    };
  }
  return { category: "Reliability", question: QUESTIONS.Reliability, score: 0, notes: "Static/unit gave DIFFERENT results across two runs \u2014 not reliable." };
}
function scoreHandoffReadiness(root) {
  const questions = freshSessionTest(root);
  const answered = questions.filter((q) => q.answered).length;
  const score = answered === questions.length ? 2 : answered > 0 ? 1 : 0;
  return {
    category: "Handoff readiness",
    question: QUESTIONS["Handoff readiness"],
    score,
    notes: `${answered}/${questions.length} fresh-session questions answered.`
  };
}
function scoreWithDivergence(category, checker, human) {
  const question = category === "Correctness" ? QUESTIONS.Correctness : QUESTIONS.Maintainability;
  if (human !== void 0) {
    const divergence = checker !== void 0 ? { category, checkerScore: checker, humanScore: human, diverged: checker !== human } : null;
    const notes = checker !== void 0 ? `Human-scored (checker had estimated ${checker}).` : "Human-scored.";
    return { score: { category, question, score: human, notes }, divergence };
  }
  if (checker !== void 0) {
    return { score: { category, question, score: checker, notes: "Checker-scored." }, divergence: null };
  }
  return { score: { category, question, score: "n/a", notes: `No score supplied \u2014 pass --score ${category.toLowerCase()}=N or --human ${category.toLowerCase()}=N.` }, divergence: null };
}
function evaluateFeature(root, doc, featureId, opts = {}) {
  const feature2 = doc.features.find((f) => f.id === featureId);
  if (!feature2) throw new Error(`No such feature: ${featureId}`);
  const correctness = scoreWithDivergence("Correctness", opts.correctness, opts.humanCorrectness);
  const maintainability = scoreWithDivergence("Maintainability", opts.maintainability, opts.humanMaintainability);
  const scores = [
    correctness.score,
    scoreVerification(feature2),
    scoreScopeDiscipline(root, feature2),
    scoreReliability(feature2, root, opts.knownReliabilityFirstRun),
    maintainability.score,
    scoreHandoffReadiness(root)
  ];
  const numericScores = scores.map((s) => s.score).filter((s) => s !== "n/a");
  const verdict = numericScores.includes(0) ? "Block" : numericScores.includes(1) ? "Revise" : "Accept";
  const divergences = [correctness.divergence, maintainability.divergence].filter((d) => d !== null);
  return { featureId, date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), scores, verdict, divergences };
}
function formatEvaluation(result) {
  const lines = [];
  lines.push(`# Evaluator Rubric: ${result.featureId} (${result.date})`, "");
  lines.push("| Category | Question | Score (0-2) | Notes |");
  lines.push("| --- | --- | --- | --- |");
  for (const s of result.scores) {
    lines.push(`| ${s.category} | ${s.question} | ${s.score} | ${s.notes} |`);
  }
  lines.push("", "## Verdict", "", `- ${result.verdict}`);
  if (result.divergences.length > 0) {
    lines.push("", "## Checker/Human Divergence", "");
    for (const d of result.divergences) {
      lines.push(`- ${d.category}: checker ${d.checkerScore}, human ${d.humanScore}${d.diverged ? " \u2014 DIVERGED" : " (agreed)"}`);
    }
  }
  return lines.join("\n");
}
function evaluationPath(root, featureId, date) {
  return path21.join(resolveProjectPaths(root).hxDir, "evaluations", `${featureId}-${date}.md`);
}
function tuningLedgerPath(root) {
  return path21.join(resolveProjectPaths(root).hxDir, "evaluations", "tuning.jsonl");
}
function appendTuningLedger(root, featureId, date, divergences) {
  if (divergences.length === 0) return;
  const p = tuningLedgerPath(root);
  fs21.mkdirSync(path21.dirname(p), { recursive: true });
  const lines = divergences.map((d) => JSON.stringify({ date, featureId, ...d }));
  fs21.appendFileSync(p, lines.join("\n") + "\n", "utf-8");
}
function readTuningStats(root) {
  const p = tuningLedgerPath(root);
  if (!fs21.existsSync(p)) return { total: 0, diverged: 0, divergenceRate: 0 };
  const lines = fs21.readFileSync(p, "utf-8").split("\n").filter((l) => l.trim().length > 0);
  let diverged = 0;
  let total = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      total++;
      if (row.diverged) diverged++;
    } catch {
    }
  }
  return { total, diverged, divergenceRate: total === 0 ? 0 : diverged / total };
}
function cmdEvaluate(targetDir, featureId, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const doc = loadFeatureList(paths.featureListPath);
  const result = evaluateFeature(paths.root, doc, featureId, opts);
  const full = evaluationPath(paths.root, featureId, result.date);
  fs21.mkdirSync(path21.dirname(full), { recursive: true });
  fs21.writeFileSync(full, formatEvaluation(result), "utf-8");
  appendTuningLedger(paths.root, featureId, result.date, result.divergences);
  new EventLog(paths.hxDir).append("evaluate", {
    featureId,
    verdict: result.verdict,
    scores: Object.fromEntries(result.scores.map((s) => [s.category, s.score])),
    divergences: result.divergences
  });
  return result;
}

// src/kit/doctor.ts
var REFERENCE_DROP_EXCLUDED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-kit",
  "build",
  ".next",
  "coverage",
  ".hx",
  ".hx-worktrees",
  ".claude"
]);
var REFERENCE_DROP_TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
var REFERENCE_DROP_MAX_DEPTH = 6;
function referenceDropReason(fullDir) {
  const reasons = [];
  if (fs22.existsSync(path22.join(fullDir, "package.json"))) reasons.push("has a package.json");
  let hasTestFile = false;
  let hasTestsDir = false;
  const walk2 = (dir, depth) => {
    if (depth > REFERENCE_DROP_MAX_DEPTH) return;
    let entries;
    try {
      entries = fs22.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        if (/^tests?$/.test(entry.name)) hasTestsDir = true;
        walk2(path22.join(dir, entry.name), depth + 1);
      } else if (REFERENCE_DROP_TEST_FILE_RE.test(entry.name)) {
        hasTestFile = true;
      }
    }
  };
  walk2(fullDir, 0);
  if (hasTestFile) reasons.push("contains test/spec files");
  if (hasTestsDir) reasons.push("has a tests?/ directory");
  return reasons.length > 0 ? reasons.join("; ") : null;
}
function findReferenceDrops(root) {
  let output;
  try {
    output = (0, import_node_child_process7.execFileSync)("git", ["status", "--porcelain", "--ignored", "-unormal"], {
      cwd: root,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return [];
  }
  const topDirs = /* @__PURE__ */ new Set();
  for (const line of output.split("\n")) {
    if (line.length < 3) continue;
    const status = line.slice(0, 2);
    if (status !== "??" && status !== "!!") continue;
    const rest = line.slice(3).trim();
    if (!rest.includes("/")) continue;
    const firstSegment = rest.split("/")[0];
    if (REFERENCE_DROP_EXCLUDED_DIRS.has(firstSegment)) continue;
    topDirs.add(firstSegment);
  }
  const findings = [];
  for (const dir of topDirs) {
    const full = path22.join(root, dir);
    let isDir = false;
    try {
      isDir = fs22.statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    const reason = referenceDropReason(full);
    if (reason) findings.push({ dir, reason });
  }
  return findings.sort((a, b) => a.dir.localeCompare(b.dir));
}
var STATE_SIZE_WARN_BYTES = 100 * 1024;
function checkStateSize(paths) {
  if (!fs22.existsSync(paths.featureListPath)) return null;
  let sizeBytes;
  try {
    sizeBytes = fs22.statSync(paths.featureListPath).size;
  } catch {
    return null;
  }
  if (sizeBytes <= STATE_SIZE_WARN_BYTES) return null;
  let featureCount = 0;
  let evidenceCount = 0;
  try {
    const doc = loadFeatureList(paths.featureListPath);
    featureCount = doc.features.length;
    evidenceCount = doc.features.reduce((sum, f) => sum + (f.evidence?.length ?? 0), 0);
  } catch {
  }
  return { path: paths.featureListPath, sizeBytes, featureCount, evidenceCount };
}
function checkUserLevelHooks(opts = {}) {
  let home;
  try {
    home = opts.homeDir ?? os.homedir();
  } catch {
    return null;
  }
  if (!home) return null;
  const settingsPath = path22.join(home, ".claude", "settings.json");
  let settings;
  try {
    if (!fs22.existsSync(settingsPath)) return null;
    settings = JSON.parse(fs22.readFileSync(settingsPath, "utf-8"));
  } catch {
    return null;
  }
  const hooksObj = settings && typeof settings === "object" && settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  const active = ["PreToolUse", "PostToolUse", "Stop"].filter((h) => Array.isArray(hooksObj[h]) && hooksObj[h].length > 0);
  if (active.length === 0) return null;
  return {
    name: "user-level hooks also active",
    passed: true,
    detail: `${settingsPath} declares ${active.length} hook event(s) (${active.join(", ")}) that also run against this project. A user-level guard can deny paths the kit allows, and can block installing .claude/settings.json itself \u2014 see README "Coexisting with a user-level guard".`
  };
}
var EXPECTED_HOOKS = ["SessionStart", "PreToolUse", "PostToolUse", "Stop", "SessionEnd", "PreCompact"];
var SPAWN_FAILURE_SIGNATURES = [
  "is not recognized as an internal or external command",
  "command not found",
  "cannot find module",
  "module_not_found",
  "enoent"
];
function looksLikeSpawnFailure(text) {
  const lower = text.toLowerCase();
  return SPAWN_FAILURE_SIGNATURES.some((s) => lower.includes(s));
}
function probeHookCommand(root, command, eventName) {
  const payload = { session_id: "hx-doctor-probe", cwd: root };
  if (eventName === "PreToolUse") {
    payload.tool_name = "Read";
    payload.tool_input = { file_path: path22.join(root, ".claude", "README.md") };
  }
  try {
    (0, import_node_child_process7.execSync)(command, {
      cwd: root,
      timeout: 8e3,
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { ok: true, detail: "ran, exit 0" };
  } catch (err) {
    const e = err;
    const stderrText = e.stderr ? e.stderr.toString() : String(e.message ?? "");
    if (e.status == null || looksLikeSpawnFailure(stderrText)) {
      return { ok: false, detail: `did not run: ${(stderrText || e.message || "unknown error").slice(0, 200)}` };
    }
    if (eventName === "Stop" && e.status === 2) {
      return { ok: true, detail: "ran, exit 2 (blocked \u2014 a real decision, not a wiring failure)" };
    }
    return { ok: false, detail: `ran but exited ${e.status}: ${stderrText.slice(0, 200)}` };
  }
}
var EXPECTED_AGENTS = ["fixer.md", "test-writer.md", "triager.md", "verifier.md"];
function continuityChecklist(root) {
  const paths = resolveProjectPaths(root);
  const recentWorkIdentifiable = fs22.existsSync(paths.progressPath);
  const startupPathDocumented = fs22.existsSync(path22.join(root, "init.sh")) || fs22.existsSync(path22.join(root, "init.ps1")) || Boolean(paths.kitConfig?.commands.start);
  let unfinishedWorkIdentified = false;
  let nextTaskVisible = false;
  if (fs22.existsSync(paths.featureListPath)) {
    try {
      const doc = loadFeatureList(paths.featureListPath);
      unfinishedWorkIdentified = doc.features.some((f) => f.status !== "passing");
      nextTaskVisible = Boolean(pickNext(doc) || activeFeature(doc));
    } catch {
    }
  }
  if (!nextTaskVisible) {
    try {
      const handoff = fs22.readFileSync(paths.handoffPath, "utf-8");
      nextTaskVisible = /Highest-priority unfinished feature: (?!\(none\))\S/.test(handoff);
    } catch {
    }
  }
  return [
    { label: "Can a fresh agent identify recent work in under five minutes? (progress log)", passed: recentWorkIdentifiable },
    { label: "Is the current stable startup path documented?", passed: startupPathDocumented },
    { label: "Is unfinished work clearly identified?", passed: unfinishedWorkIdentified },
    { label: "Is the next best task visible without reading old chat logs?", passed: nextTaskVisible }
  ];
}
function checkCrossComponentChanges(root) {
  const source = activeScopeSource(root);
  if (!source || source.kind !== "feature") return null;
  const paths = resolveProjectPaths(root);
  if (!fs22.existsSync(paths.featureListPath)) return null;
  const doc = loadFeatureList(paths.featureListPath);
  const feature2 = doc.features.find((f) => f.id === source.id);
  if (!feature2) return null;
  const hasHigherLevel = feature2.verification.some((v) => v.level === "integration" || v.level === "e2e");
  if (hasHigherLevel) return null;
  const changed = getChangedFiles(root).filter((f) => !isHarnessBookkeepingFile(root, f));
  const topDirs = new Set(changed.map((f) => f.split("/")[0]).filter(Boolean));
  if (topDirs.size < 2) return null;
  return `Feature "${feature2.id}" changes span ${topDirs.size} top-level directories (${[...topDirs].join(", ")}) but has no integration/e2e verification entry. Cross-component changes without a higher-level check are a common source of "works in isolation, breaks integrated" \u2014 consider adding one.`;
}
function checkKitWiring(root, opts = {}) {
  const liveProbe = opts.liveProbe ?? true;
  const checks = [];
  const claudeDir = path22.join(root, ".claude");
  const hxCjsPath = path22.join(claudeDir, "bin", "hx.cjs");
  const hxCjsExists = fs22.existsSync(hxCjsPath);
  checks.push({
    name: "bin/hx.cjs exists",
    passed: hxCjsExists,
    detail: hxCjsExists ? hxCjsPath : "not found \u2014 run `hx kit install`"
  });
  let hxCjsRuns = false;
  let runDetail = "not checked (binary missing)";
  if (hxCjsExists) {
    try {
      const out = (0, import_node_child_process7.execFileSync)("node", [hxCjsPath, "--version"], {
        encoding: "utf-8",
        timeout: 5e3,
        stdio: ["ignore", "pipe", "pipe"]
      }).trim();
      hxCjsRuns = true;
      runDetail = `runs: ${out}`;
    } catch (err) {
      runDetail = `failed to run: ${err.message}`;
    }
  }
  checks.push({ name: "bin/hx.cjs runs (node bin/hx.cjs --version)", passed: hxCjsRuns, detail: runDetail });
  const settingsPath = path22.join(claudeDir, "settings.json");
  let settings = null;
  if (fs22.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs22.readFileSync(settingsPath, "utf-8"));
    } catch {
      settings = null;
    }
  }
  const settingsParses = settings !== null;
  checks.push({
    name: "settings.json parses",
    passed: settingsParses,
    detail: settingsParses ? "valid JSON" : fs22.existsSync(settingsPath) ? "invalid JSON" : "not found"
  });
  if (settingsParses) {
    const hooksObj = settings.hooks ?? {};
    const missingHooks = EXPECTED_HOOKS.filter((h) => {
      const entries = Array.isArray(hooksObj[h]) ? hooksObj[h] : [];
      const commands = entries.flatMap(
        (e) => (Array.isArray(e.hooks) ? e.hooks : []).map((hh) => String(hh.command ?? ""))
      );
      return !commands.some((c) => c.includes("hx.cjs"));
    });
    checks.push({
      name: "all five hooks reference hx.cjs",
      passed: missingHooks.length === 0,
      detail: missingHooks.length === 0 ? EXPECTED_HOOKS.join(", ") + " all wired" : `missing/broken: ${missingHooks.join(", ")}`
    });
    if (!liveProbe) {
    } else if (hxCjsRuns) {
      const failedHooks = [];
      for (const eventName of EXPECTED_HOOKS) {
        const entries = Array.isArray(hooksObj[eventName]) ? hooksObj[eventName] : [];
        const command = entries.flatMap((e) => Array.isArray(e.hooks) ? e.hooks : []).map((hh) => String(hh.command ?? "")).find((c) => c.includes("hx.cjs"));
        if (!command) {
          failedHooks.push(`${eventName} (no command found)`);
          continue;
        }
        const result = probeHookCommand(root, command, eventName);
        if (!result.ok) failedHooks.push(`${eventName} (${result.detail})`);
      }
      checks.push({
        name: "all six hook commands actually run (live probe, not just a string match)",
        passed: failedHooks.length === 0,
        detail: failedHooks.length === 0 ? "all six ran successfully" : `broken: ${failedHooks.join("; ")}`
      });
    } else {
      checks.push({
        name: "all six hook commands actually run (live probe, not just a string match)",
        passed: false,
        detail: "cannot check \u2014 bin/hx.cjs itself does not run"
      });
    }
    const denyList = Array.isArray(settings.permissions?.deny) ? settings.permissions.deny : [];
    const denyText = denyList.join(" ");
    const gapNames = [
      ["issue close", /issue close/.test(denyText)],
      ["issue wontfix", /issue wontfix/.test(denyText)],
      ["feature reopen", /feature reopen/.test(denyText)],
      ["feature reset", /feature reset/.test(denyText)]
    ];
    const missingDeny = gapNames.filter(([, present]) => !present).map(([name]) => name);
    checks.push({
      name: "permissions.deny blocks issue close / wontfix / feature reopen / reset",
      passed: missingDeny.length === 0,
      detail: missingDeny.length === 0 ? "all four human-only commands are denied" : `missing from deny list: ${missingDeny.join(", ")}`
    });
  } else {
    checks.push({ name: "all five hooks reference hx.cjs", passed: false, detail: "cannot check \u2014 settings.json missing or invalid" });
    checks.push({
      name: "all six hook commands actually run (live probe, not just a string match)",
      passed: false,
      detail: "cannot check \u2014 settings.json missing or invalid"
    });
    checks.push({ name: "permissions.deny blocks issue close / wontfix / feature reopen / reset", passed: false, detail: "cannot check \u2014 settings.json missing or invalid" });
  }
  let configOk = false;
  let configDetail = "not found \u2014 this should not happen once .claude/hx.config.json exists (checkKitWiring is only called in kit layout)";
  try {
    const cfg = loadKitConfig(root);
    configOk = cfg !== null;
    configDetail = cfg !== null ? "valid" : configDetail;
  } catch (err) {
    configOk = false;
    configDetail = err instanceof KitConfigError ? err.message : `unexpected error: ${err.message}`;
  }
  checks.push({ name: "hx.config.json validates", passed: configOk, detail: configDetail });
  const agentsDir = path22.join(claudeDir, "agents");
  const missingAgents = EXPECTED_AGENTS.filter((a) => !fs22.existsSync(path22.join(agentsDir, a)));
  checks.push({
    name: "4 sub-agents present (fixer, test-writer, triager, verifier)",
    passed: missingAgents.length === 0,
    detail: missingAgents.length === 0 ? "all present" : `missing: ${missingAgents.join(", ")}`
  });
  const skillsDir = path22.join(claudeDir, "skills");
  let skillsChecked = 0;
  const badSkills = [];
  if (fs22.existsSync(skillsDir)) {
    for (const entry of fs22.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      skillsChecked++;
      const skillFile = path22.join(skillsDir, entry.name, "SKILL.md");
      if (!fs22.existsSync(skillFile)) {
        badSkills.push(`${entry.name} (no SKILL.md)`);
        continue;
      }
      const content = fs22.readFileSync(skillFile, "utf-8");
      if (!content.trimStart().startsWith("---")) badSkills.push(`${entry.name} (no YAML frontmatter)`);
    }
  }
  checks.push({
    name: "every skill has SKILL.md with frontmatter",
    passed: skillsChecked > 0 && badSkills.length === 0,
    detail: skillsChecked === 0 ? "no skills/ directory found" : badSkills.length === 0 ? `${skillsChecked} skill(s) OK` : `problems: ${badSkills.join(", ")}`
  });
  const userLevelHooks = checkUserLevelHooks({ homeDir: opts.homeDir });
  if (userLevelHooks) checks.push(userLevelHooks);
  return checks;
}
function findStaleContracts(root) {
  const paths = resolveProjectPaths(root);
  const stale = [];
  if (fs22.existsSync(paths.featureListPath)) {
    try {
      const doc = loadFeatureList(paths.featureListPath);
      for (const f of doc.features) {
        if (!f.contractHash) continue;
        const exclusions = computeExclusions(doc, f.id, paths.kitConfig);
        if (contractChanged(f, exclusions)) stale.push(`feature ${f.id}`);
      }
    } catch {
    }
  }
  try {
    for (const issue2 of listIssues(root)) {
      if (!issue2.frontmatter.contractHash) continue;
      const verification = issue2.frontmatter.verification.map((cmd) => ({ level: "unit", cmd }));
      if (contractChanged({ scope: issue2.frontmatter.scope, verification, contractHash: issue2.frontmatter.contractHash }, paths.kitConfig?.handsOff ?? [])) {
        stale.push(`issue ${issue2.frontmatter.id}`);
      }
    }
  } catch {
  }
  return stale;
}
function runDoctor(targetDir, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const resolved = paths.root;
  const repoScoreResult = scoreRepo(resolved);
  const initResults = runInitChecks(resolved);
  const candidates = ["AGENTS.md", "CLAUDE.md", path22.join(".claude", "CLAUDE.md")];
  const foundName = candidates.find((c) => fs22.existsSync(path22.join(resolved, c)));
  const agentsPath = foundName ? path22.join(resolved, foundName) : null;
  const agentsMdLint = [];
  if (agentsPath) {
    const content = fs22.readFileSync(agentsPath, "utf-8");
    const fileDir = path22.dirname(agentsPath);
    agentsMdLint.push(
      ...formatLintFindings([
        ...lintInstructionFile(content, fileDir, foundName, { instructionSections: paths.kitConfig?.instructionSections }),
        ...lintLinkedTopicDocs(content, fileDir)
      ])
    );
  } else {
    agentsMdLint.push("No AGENTS.md or CLAUDE.md found. Run `hx init` or `hx kit install`.");
  }
  agentsMdLint.push(...formatLintFindings(lintSubdirectoryInstructionFiles(resolved)));
  const verificationLint = [];
  let dependencyCycle = null;
  if (fs22.existsSync(paths.featureListPath)) {
    const doc = loadFeatureList(paths.featureListPath);
    for (const f of doc.features) {
      for (const v of f.verification) {
        if ("cmd" in v && v.cmd) {
          for (const violation of lintVerificationCommand(v.cmd)) {
            verificationLint.push(`[${f.id}] ${violation.error} \u2014 ${violation.fix}`);
          }
        }
      }
    }
    dependencyCycle = findDependencyCycle(doc);
  }
  const crossComponentWarning = checkCrossComponentChanges(resolved);
  const continuity = continuityChecklist(resolved);
  const eventLog = new EventLog(paths.hxDir);
  const recentHookErrors = eventLog.readByType("hook.error").slice(-5).map((e) => ({ ts: e.ts, hook: String(e.hook), message: String(e.message) }));
  const recentWatchErrors = eventLog.readByType("watch.error").slice(-5).map((e) => ({ ts: e.ts, message: String(e.message) }));
  const recentContractChanges = eventLog.readByType("contract.changed").slice(-5).map((e) => ({ ts: e.ts, id: String(e.id), reason: String(e.reason) }));
  const baselineViolationEvents = eventLog.readByType("init.baseline-violation");
  const lastBaselineViolation = baselineViolationEvents[baselineViolationEvents.length - 1];
  const baselineViolation = lastBaselineViolation ? { ts: lastBaselineViolation.ts, unexpected: lastBaselineViolation.unexpected ?? [] } : null;
  const rulesFileError = rulesFileParseError(paths.hxDir);
  const corruptEventLogLines = eventLog.corruptLineCount();
  const referenceDrops = findReferenceDrops(resolved);
  const stateSize = checkStateSize(paths);
  const kitWiring = paths.layout === "kit" ? checkKitWiring(resolved) : null;
  const advancedChecks = isAdvancedPack(resolved) ? advancedDoctorChecks(paths) : null;
  const full = opts.full ? {
    ruleViolations: runAllRules(resolved),
    staleContracts: findStaleContracts(resolved),
    audit: runAudit(resolved),
    // "No golden journeys configured" is the expected, common case (most projects never
    // opt into docs/RELIABILITY.md's table) — not a doctor failure, so it maps to an empty
    // list rather than propagating the FeatureListError cmdJourneyRun throws for that case.
    journeyResults: (() => {
      try {
        return cmdJourneyRun(resolved);
      } catch {
        return [];
      }
    })(),
    adapterNotice: fs22.existsSync(path22.join(resolved, "goal.md")) ? `hx loop --adapter claude is not wired in this environment \u2014 only the fake adapter ships. See README.md's "The loop and graph runner" section for how to add one.` : null
  } : null;
  return {
    repoScore: formatRepoScore(repoScoreResult),
    initChecks: formatInitChecks(initResults),
    agentsMdLint,
    verificationLint,
    crossComponentWarning,
    continuityChecklist: continuity,
    recentHookErrors,
    recentWatchErrors,
    recentContractChanges,
    baselineViolation,
    rulesFileError,
    corruptEventLogLines,
    referenceDrops,
    stateSize,
    kitWiring,
    dependencyCycle,
    advancedChecks,
    tuningStats: readTuningStats(resolved),
    full
  };
}
function formatDoctorReport(report) {
  const lines = [];
  lines.push(report.repoScore);
  lines.push("");
  lines.push("Init prerequisite checks:");
  lines.push(report.initChecks);
  lines.push("");
  if (report.agentsMdLint.length > 0) {
    lines.push("AGENTS.md lint:");
    for (const l of report.agentsMdLint) lines.push(`  - ${l}`);
  }
  if (report.verificationLint.length > 0) {
    lines.push("Verification command lint:");
    for (const l of report.verificationLint) lines.push(`  - ${l}`);
  }
  if (report.dependencyCycle) {
    lines.push(`ERROR: feature dependency cycle: ${report.dependencyCycle.join(" -> ")}`);
    lines.push(`  WHY: every feature in this cycle can never satisfy dependsOn and will never be picked as "next".`);
    lines.push(`  FIX: remove or redirect one dependsOn edge in the cycle above.`);
  }
  if (report.crossComponentWarning) {
    lines.push(`WARN: ${report.crossComponentWarning}`);
  }
  if (report.agentsMdLint.length === 0 && report.verificationLint.length === 0 && !report.dependencyCycle && !report.crossComponentWarning) {
    lines.push("No lint issues found.");
  }
  if (report.recentHookErrors.length > 0) {
    lines.push("");
    lines.push(`Recent hook errors (${report.recentHookErrors.length}):`);
    for (const e of report.recentHookErrors) lines.push(`  - [${e.ts}] ${e.hook}: ${e.message}`);
  }
  if (report.recentWatchErrors.length > 0) {
    lines.push("");
    lines.push(`Recent watch errors (${report.recentWatchErrors.length}):`);
    for (const e of report.recentWatchErrors) lines.push(`  - [${e.ts}] ${e.message}`);
  }
  if (report.recentContractChanges.length > 0) {
    lines.push("");
    lines.push(`Recent contract changes (${report.recentContractChanges.length}):`);
    for (const e of report.recentContractChanges) lines.push(`  - [${e.ts}] ${e.id}: ${e.reason}`);
  }
  if (report.baselineViolation) {
    lines.push("");
    lines.push(
      `WARN: hx init's baseline commit (${report.baselineViolation.ts}) contains file(s) it did not write: ${report.baselineViolation.unexpected.join(", ")}. Review that commit.`
    );
  }
  if (report.rulesFileError) {
    lines.push("");
    lines.push(`FAIL: ${report.rulesFileError}`);
  }
  if (report.corruptEventLogLines > 0) {
    lines.push("");
    lines.push(`WARN: events.jsonl has ${report.corruptEventLogLines} unparseable line(s) \u2014 some session history may be lost.`);
  }
  if (report.referenceDrops.length > 0) {
    lines.push("");
    lines.push(`Reference drops (${report.referenceDrops.length}) \u2014 untracked/ignored top-level directories that look like foreign packages, not build output:`);
    for (const d of report.referenceDrops) lines.push(`  - ${d.dir}/ (${d.reason}) \u2014 a bare test runner (e.g. node --test) will pick this up too`);
  }
  if (report.stateSize) {
    lines.push("");
    lines.push(
      `INFO: ${report.stateSize.path} is ${(report.stateSize.sizeBytes / 1024).toFixed(0)} KB (${report.stateSize.featureCount} feature(s), ${report.stateSize.evidenceCount} evidence entrie(s)) \u2014 read it via \`hx feature list\` / \`hx start\` rather than the raw file.`
    );
  }
  if (report.kitWiring) {
    lines.push("");
    lines.push("Kit wiring:");
    for (const c of report.kitWiring) lines.push(`  [${c.passed ? "PASS" : "FAIL"}] ${c.name} \u2014 ${c.detail}`);
  }
  lines.push("");
  lines.push("Continuity checklist (Lecture 5):");
  for (const c of report.continuityChecklist) lines.push(`  [${c.passed ? "x" : " "}] ${c.label}`);
  if (report.advancedChecks) {
    lines.push("");
    lines.push("Advanced pack (Phase 8):");
    for (const c of report.advancedChecks) lines.push(`  [${c.status}] ${c.name} \u2014 ${c.detail}`);
  }
  if (report.tuningStats.total > 0) {
    lines.push("");
    lines.push(
      `Evaluator tuning ledger: ${report.tuningStats.diverged}/${report.tuningStats.total} checker/human scores diverged (${(report.tuningStats.divergenceRate * 100).toFixed(0)}%).`
    );
  }
  if (report.full) {
    lines.push("");
    lines.push(`Rule violations (${report.full.ruleViolations.length}):`);
    for (const v of report.full.ruleViolations) lines.push(`  [${v.ruleId}] ${v.file}${v.line ? `:${v.line}` : ""} \u2014 ${v.error}`);
    lines.push("");
    lines.push(`Stale sprint contracts (${report.full.staleContracts.length}):`);
    for (const s of report.full.staleContracts) lines.push(`  - ${s}`);
    lines.push("");
    lines.push(formatAuditReport(report.full.audit));
    lines.push("");
    if (report.full.journeyResults.length > 0) {
      lines.push(`Golden journeys (${report.full.journeyResults.length}, each run twice):`);
      for (const r of report.full.journeyResults) {
        const status = r.passed ? "PASS" : !r.deterministic ? "FLAKY" : "FAIL";
        lines.push(`  [${status}] ${r.name} \u2014 run 1: exit ${r.firstExitCode}, run 2: exit ${r.secondExitCode}`);
      }
    } else {
      lines.push("Golden journeys: none configured (docs/RELIABILITY.md's Golden Journeys table is empty or absent).");
    }
    if (report.full.adapterNotice) {
      lines.push("");
      lines.push(`NOTE: ${report.full.adapterNotice}`);
    }
  }
  return lines.join("\n");
}

// src/kit/start.ts
var fs26 = __toESM(require("node:fs"), 1);
var crypto3 = __toESM(require("node:crypto"), 1);
var path26 = __toESM(require("node:path"), 1);
var import_node_child_process9 = require("node:child_process");

// src/core/lessons.ts
var fs23 = __toESM(require("node:fs"), 1);
var path23 = __toESM(require("node:path"), 1);
function appendLesson(targetDir, lesson2) {
  const paths = resolveProjectPaths(targetDir);
  let content;
  try {
    content = fs23.readFileSync(paths.lessonsPath, "utf-8");
  } catch {
    content = readTemplate("LESSONS.md");
  }
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const entry = `
## ${date}: ${lesson2.title}

- Source: ${lesson2.source} (${lesson2.id})
- ${lesson2.reason}
`;
  fs23.mkdirSync(path23.dirname(paths.lessonsPath), { recursive: true });
  fs23.writeFileSync(paths.lessonsPath, content.trimEnd() + "\n" + entry, "utf-8");
}
function readRecentLessons(targetDir, n = 3) {
  const paths = resolveProjectPaths(targetDir);
  let content;
  try {
    content = fs23.readFileSync(paths.lessonsPath, "utf-8");
  } catch {
    return [];
  }
  const entries = [...content.matchAll(/^## (\d{4}-\d{2}-\d{2}): (.+)\n\n- Source: (\S+) \((\S+)\)\n- ([\s\S]*?)(?=\n## |\n*$)/gm)];
  return entries.map((m) => ({
    date: m[1],
    title: m[2],
    source: m[3],
    id: m[4],
    reason: m[5].trim()
  })).reverse().slice(0, n);
}

// src/core/decisions.ts
var fs24 = __toESM(require("node:fs"), 1);
var path24 = __toESM(require("node:path"), 1);
function appendDecision(targetDir, decision2) {
  const paths = resolveProjectPaths(targetDir);
  let content;
  try {
    content = fs24.readFileSync(paths.decisionsPath, "utf-8");
  } catch {
    content = readTemplate("DECISIONS.md");
  }
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const lines = [`
## ${date}: ${decision2.title}`, ""];
  if (decision2.reason) lines.push(`- Reason: ${decision2.reason}`);
  if (decision2.rejectedAlternative) lines.push(`- Rejected alternative: ${decision2.rejectedAlternative}`);
  if (decision2.constraint) lines.push(`- Constraint: ${decision2.constraint}`);
  lines.push("");
  fs24.mkdirSync(path24.dirname(paths.decisionsPath), { recursive: true });
  fs24.writeFileSync(paths.decisionsPath, content.trimEnd() + "\n" + lines.join("\n"), "utf-8");
}
function readRecentDecisions(targetDir, n = 3) {
  const paths = resolveProjectPaths(targetDir);
  let content;
  try {
    content = fs24.readFileSync(paths.decisionsPath, "utf-8");
  } catch {
    return [];
  }
  const entries = [...content.matchAll(/^## (\d{4}-\d{2}-\d{2}): (.+)\n\n([\s\S]*?)(?=\n## |\n*$)/gm)];
  return entries.map((m) => {
    const body = m[3];
    const field = (name) => body.match(new RegExp(`- ${name}: (.+)`))?.[1]?.trim();
    return {
      date: m[1],
      title: m[2],
      reason: field("Reason"),
      rejectedAlternative: field("Rejected alternative"),
      constraint: field("Constraint")
    };
  }).reverse().slice(0, n);
}

// src/kit/feature.ts
var fs25 = __toESM(require("node:fs"), 1);
var path25 = __toESM(require("node:path"), 1);
var import_node_child_process8 = require("node:child_process");

// node_modules/zod-to-json-schema/dist/esm/Options.js
var ignoreOverride = Symbol("Let zodToJsonSchema decide on which parser to use");
var defaultOptions = {
  name: void 0,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  target: "jsonSchema7",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  markdownDescription: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref",
  openAiAnyTypeName: "OpenAiAnyType"
};
var getDefaultOptions = (options) => typeof options === "string" ? {
  ...defaultOptions,
  name: options
} : {
  ...defaultOptions,
  ...options
};

// node_modules/zod-to-json-schema/dist/esm/Refs.js
var getRefs = (options) => {
  const _options = getDefaultOptions(options);
  const currentPath = _options.name !== void 0 ? [..._options.basePath, _options.definitionPath, _options.name] : _options.basePath;
  return {
    ..._options,
    flags: { hasReferencedOpenAiAnyType: false },
    currentPath,
    propertyPath: void 0,
    seen: new Map(Object.entries(_options.definitions).map(([name, def]) => [
      def._def,
      {
        def: def._def,
        path: [..._options.basePath, _options.definitionPath, name],
        // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
        jsonSchema: void 0
      }
    ]))
  };
};

// node_modules/zod-to-json-schema/dist/esm/errorMessages.js
function addErrorMessage(res, key, errorMessage, refs) {
  if (!refs?.errorMessages)
    return;
  if (errorMessage) {
    res.errorMessage = {
      ...res.errorMessage,
      [key]: errorMessage
    };
  }
}
function setResponseValueAndErrors(res, key, value, errorMessage, refs) {
  res[key] = value;
  addErrorMessage(res, key, errorMessage, refs);
}

// node_modules/zod-to-json-schema/dist/esm/getRelativePath.js
var getRelativePath = (pathA, pathB) => {
  let i = 0;
  for (; i < pathA.length && i < pathB.length; i++) {
    if (pathA[i] !== pathB[i])
      break;
  }
  return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};

// node_modules/zod-to-json-schema/dist/esm/parsers/any.js
function parseAnyDef(refs) {
  if (refs.target !== "openAi") {
    return {};
  }
  const anyDefinitionPath = [
    ...refs.basePath,
    refs.definitionPath,
    refs.openAiAnyTypeName
  ];
  refs.flags.hasReferencedOpenAiAnyType = true;
  return {
    $ref: refs.$refStrategy === "relative" ? getRelativePath(anyDefinitionPath, refs.currentPath) : anyDefinitionPath.join("/")
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/array.js
function parseArrayDef(def, refs) {
  const res = {
    type: "array"
  };
  if (def.type?._def && def.type?._def?.typeName !== ZodFirstPartyTypeKind.ZodAny) {
    res.items = parseDef(def.type._def, {
      ...refs,
      currentPath: [...refs.currentPath, "items"]
    });
  }
  if (def.minLength) {
    setResponseValueAndErrors(res, "minItems", def.minLength.value, def.minLength.message, refs);
  }
  if (def.maxLength) {
    setResponseValueAndErrors(res, "maxItems", def.maxLength.value, def.maxLength.message, refs);
  }
  if (def.exactLength) {
    setResponseValueAndErrors(res, "minItems", def.exactLength.value, def.exactLength.message, refs);
    setResponseValueAndErrors(res, "maxItems", def.exactLength.value, def.exactLength.message, refs);
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/bigint.js
function parseBigintDef(def, refs) {
  const res = {
    type: "integer",
    format: "int64"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/boolean.js
function parseBooleanDef() {
  return {
    type: "boolean"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/branded.js
function parseBrandedDef(_def, refs) {
  return parseDef(_def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/catch.js
var parseCatchDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/date.js
function parseDateDef(def, refs, overrideDateStrategy) {
  const strategy = overrideDateStrategy ?? refs.dateStrategy;
  if (Array.isArray(strategy)) {
    return {
      anyOf: strategy.map((item, i) => parseDateDef(def, refs, item))
    };
  }
  switch (strategy) {
    case "string":
    case "format:date-time":
      return {
        type: "string",
        format: "date-time"
      };
    case "format:date":
      return {
        type: "string",
        format: "date"
      };
    case "integer":
      return integerDateParser(def, refs);
  }
}
var integerDateParser = (def, refs) => {
  const res = {
    type: "integer",
    format: "unix-time"
  };
  if (refs.target === "openApi3") {
    return res;
  }
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        setResponseValueAndErrors(
          res,
          "minimum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
      case "max":
        setResponseValueAndErrors(
          res,
          "maximum",
          check.value,
          // This is in milliseconds
          check.message,
          refs
        );
        break;
    }
  }
  return res;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/default.js
function parseDefaultDef(_def, refs) {
  return {
    ...parseDef(_def.innerType._def, refs),
    default: _def.defaultValue()
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/effects.js
function parseEffectsDef(_def, refs) {
  return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/enum.js
function parseEnumDef(def) {
  return {
    type: "string",
    enum: Array.from(def.values)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/intersection.js
var isJsonSchema7AllOfType = (type) => {
  if ("type" in type && type.type === "string")
    return false;
  return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
  const allOf = [
    parseDef(def.left._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "0"]
    }),
    parseDef(def.right._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "1"]
    })
  ].filter((x) => !!x);
  let unevaluatedProperties = refs.target === "jsonSchema2019-09" ? { unevaluatedProperties: false } : void 0;
  const mergedAllOf = [];
  allOf.forEach((schema) => {
    if (isJsonSchema7AllOfType(schema)) {
      mergedAllOf.push(...schema.allOf);
      if (schema.unevaluatedProperties === void 0) {
        unevaluatedProperties = void 0;
      }
    } else {
      let nestedSchema = schema;
      if ("additionalProperties" in schema && schema.additionalProperties === false) {
        const { additionalProperties, ...rest } = schema;
        nestedSchema = rest;
      } else {
        unevaluatedProperties = void 0;
      }
      mergedAllOf.push(nestedSchema);
    }
  });
  return mergedAllOf.length ? {
    allOf: mergedAllOf,
    ...unevaluatedProperties
  } : void 0;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/literal.js
function parseLiteralDef(def, refs) {
  const parsedType = typeof def.value;
  if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
    return {
      type: Array.isArray(def.value) ? "array" : "object"
    };
  }
  if (refs.target === "openApi3") {
    return {
      type: parsedType === "bigint" ? "integer" : parsedType,
      enum: [def.value]
    };
  }
  return {
    type: parsedType === "bigint" ? "integer" : parsedType,
    const: def.value
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/string.js
var emojiRegex2 = void 0;
var zodPatterns = {
  /**
   * `c` was changed to `[cC]` to replicate /i flag
   */
  cuid: /^[cC][^\s-]{8,}$/,
  cuid2: /^[0-9a-z]+$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /**
   * `a-z` was added to replicate /i flag
   */
  email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
  /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */
  emoji: () => {
    if (emojiRegex2 === void 0) {
      emojiRegex2 = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
    }
    return emojiRegex2;
  },
  /**
   * Unused
   */
  uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
  /**
   * Unused
   */
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  /**
   * Unused
   */
  ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
  ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  nanoid: /^[a-zA-Z0-9_-]{21}$/,
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
  const res = {
    type: "string"
  };
  if (def.checks) {
    for (const check of def.checks) {
      switch (check.kind) {
        case "min":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          break;
        case "max":
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "email":
          switch (refs.emailStrategy) {
            case "format:email":
              addFormat(res, "email", check.message, refs);
              break;
            case "format:idn-email":
              addFormat(res, "idn-email", check.message, refs);
              break;
            case "pattern:zod":
              addPattern(res, zodPatterns.email, check.message, refs);
              break;
          }
          break;
        case "url":
          addFormat(res, "uri", check.message, refs);
          break;
        case "uuid":
          addFormat(res, "uuid", check.message, refs);
          break;
        case "regex":
          addPattern(res, check.regex, check.message, refs);
          break;
        case "cuid":
          addPattern(res, zodPatterns.cuid, check.message, refs);
          break;
        case "cuid2":
          addPattern(res, zodPatterns.cuid2, check.message, refs);
          break;
        case "startsWith":
          addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
          break;
        case "endsWith":
          addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
          break;
        case "datetime":
          addFormat(res, "date-time", check.message, refs);
          break;
        case "date":
          addFormat(res, "date", check.message, refs);
          break;
        case "time":
          addFormat(res, "time", check.message, refs);
          break;
        case "duration":
          addFormat(res, "duration", check.message, refs);
          break;
        case "length":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
          break;
        case "includes": {
          addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
          break;
        }
        case "ip": {
          if (check.version !== "v6") {
            addFormat(res, "ipv4", check.message, refs);
          }
          if (check.version !== "v4") {
            addFormat(res, "ipv6", check.message, refs);
          }
          break;
        }
        case "base64url":
          addPattern(res, zodPatterns.base64url, check.message, refs);
          break;
        case "jwt":
          addPattern(res, zodPatterns.jwt, check.message, refs);
          break;
        case "cidr": {
          if (check.version !== "v6") {
            addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
          }
          if (check.version !== "v4") {
            addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
          }
          break;
        }
        case "emoji":
          addPattern(res, zodPatterns.emoji(), check.message, refs);
          break;
        case "ulid": {
          addPattern(res, zodPatterns.ulid, check.message, refs);
          break;
        }
        case "base64": {
          switch (refs.base64Strategy) {
            case "format:binary": {
              addFormat(res, "binary", check.message, refs);
              break;
            }
            case "contentEncoding:base64": {
              setResponseValueAndErrors(res, "contentEncoding", "base64", check.message, refs);
              break;
            }
            case "pattern:zod": {
              addPattern(res, zodPatterns.base64, check.message, refs);
              break;
            }
          }
          break;
        }
        case "nanoid": {
          addPattern(res, zodPatterns.nanoid, check.message, refs);
        }
        case "toLowerCase":
        case "toUpperCase":
        case "trim":
          break;
        default:
          /* @__PURE__ */ ((_) => {
          })(check);
      }
    }
  }
  return res;
}
function escapeLiteralCheckValue(literal, refs) {
  return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
var ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    if (!ALPHA_NUMERIC.has(source[i])) {
      result += "\\";
    }
    result += source[i];
  }
  return result;
}
function addFormat(schema, value, message, refs) {
  if (schema.format || schema.anyOf?.some((x) => x.format)) {
    if (!schema.anyOf) {
      schema.anyOf = [];
    }
    if (schema.format) {
      schema.anyOf.push({
        format: schema.format,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { format: schema.errorMessage.format }
        }
      });
      delete schema.format;
      if (schema.errorMessage) {
        delete schema.errorMessage.format;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.anyOf.push({
      format: value,
      ...message && refs.errorMessages && { errorMessage: { format: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "format", value, message, refs);
  }
}
function addPattern(schema, regex, message, refs) {
  if (schema.pattern || schema.allOf?.some((x) => x.pattern)) {
    if (!schema.allOf) {
      schema.allOf = [];
    }
    if (schema.pattern) {
      schema.allOf.push({
        pattern: schema.pattern,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { pattern: schema.errorMessage.pattern }
        }
      });
      delete schema.pattern;
      if (schema.errorMessage) {
        delete schema.errorMessage.pattern;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.allOf.push({
      pattern: stringifyRegExpWithFlags(regex, refs),
      ...message && refs.errorMessages && { errorMessage: { pattern: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "pattern", stringifyRegExpWithFlags(regex, refs), message, refs);
  }
}
function stringifyRegExpWithFlags(regex, refs) {
  if (!refs.applyRegexFlags || !regex.flags) {
    return regex.source;
  }
  const flags = {
    i: regex.flags.includes("i"),
    m: regex.flags.includes("m"),
    s: regex.flags.includes("s")
    // `.` matches newlines
  };
  const source = flags.i ? regex.source.toLowerCase() : regex.source;
  let pattern = "";
  let isEscaped = false;
  let inCharGroup = false;
  let inCharRange = false;
  for (let i = 0; i < source.length; i++) {
    if (isEscaped) {
      pattern += source[i];
      isEscaped = false;
      continue;
    }
    if (flags.i) {
      if (inCharGroup) {
        if (source[i].match(/[a-z]/)) {
          if (inCharRange) {
            pattern += source[i];
            pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
            inCharRange = false;
          } else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
            pattern += source[i];
            inCharRange = true;
          } else {
            pattern += `${source[i]}${source[i].toUpperCase()}`;
          }
          continue;
        }
      } else if (source[i].match(/[a-z]/)) {
        pattern += `[${source[i]}${source[i].toUpperCase()}]`;
        continue;
      }
    }
    if (flags.m) {
      if (source[i] === "^") {
        pattern += `(^|(?<=[\r
]))`;
        continue;
      } else if (source[i] === "$") {
        pattern += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (flags.s && source[i] === ".") {
      pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
      continue;
    }
    pattern += source[i];
    if (source[i] === "\\") {
      isEscaped = true;
    } else if (inCharGroup && source[i] === "]") {
      inCharGroup = false;
    } else if (!inCharGroup && source[i] === "[") {
      inCharGroup = true;
    }
  }
  try {
    new RegExp(pattern);
  } catch {
    console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
    return regex.source;
  }
  return pattern;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/record.js
function parseRecordDef(def, refs) {
  if (refs.target === "openAi") {
    console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
  }
  if (refs.target === "openApi3" && def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      type: "object",
      required: def.keyType._def.values,
      properties: def.keyType._def.values.reduce((acc, key) => ({
        ...acc,
        [key]: parseDef(def.valueType._def, {
          ...refs,
          currentPath: [...refs.currentPath, "properties", key]
        }) ?? parseAnyDef(refs)
      }), {}),
      additionalProperties: refs.rejectedAdditionalProperties
    };
  }
  const schema = {
    type: "object",
    additionalProperties: parseDef(def.valueType._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    }) ?? refs.allowedAdditionalProperties
  };
  if (refs.target === "openApi3") {
    return schema;
  }
  if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.checks?.length) {
    const { type, ...keyType } = parseStringDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values
      }
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.type._def.checks?.length) {
    const { type, ...keyType } = parseBrandedDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/map.js
function parseMapDef(def, refs) {
  if (refs.mapStrategy === "record") {
    return parseRecordDef(def, refs);
  }
  const keys = parseDef(def.keyType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "0"]
  }) || parseAnyDef(refs);
  const values = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "1"]
  }) || parseAnyDef(refs);
  return {
    type: "array",
    maxItems: 125,
    items: {
      type: "array",
      items: [keys, values],
      minItems: 2,
      maxItems: 2
    }
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/nativeEnum.js
function parseNativeEnumDef(def) {
  const object = def.values;
  const actualKeys = Object.keys(def.values).filter((key) => {
    return typeof object[object[key]] !== "number";
  });
  const actualValues = actualKeys.map((key) => object[key]);
  const parsedTypes = Array.from(new Set(actualValues.map((values) => typeof values)));
  return {
    type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
    enum: actualValues
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/never.js
function parseNeverDef(refs) {
  return refs.target === "openAi" ? void 0 : {
    not: parseAnyDef({
      ...refs,
      currentPath: [...refs.currentPath, "not"]
    })
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/null.js
function parseNullDef(refs) {
  return refs.target === "openApi3" ? {
    enum: ["null"],
    nullable: true
  } : {
    type: "null"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/union.js
var primitiveMappings = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "integer",
  ZodBoolean: "boolean",
  ZodNull: "null"
};
function parseUnionDef(def, refs) {
  if (refs.target === "openApi3")
    return asAnyOf(def, refs);
  const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
  if (options.every((x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
    const types = options.reduce((types2, x) => {
      const type = primitiveMappings[x._def.typeName];
      return type && !types2.includes(type) ? [...types2, type] : types2;
    }, []);
    return {
      type: types.length > 1 ? types : types[0]
    };
  } else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
    const types = options.reduce((acc, x) => {
      const type = typeof x._def.value;
      switch (type) {
        case "string":
        case "number":
        case "boolean":
          return [...acc, type];
        case "bigint":
          return [...acc, "integer"];
        case "object":
          if (x._def.value === null)
            return [...acc, "null"];
        case "symbol":
        case "undefined":
        case "function":
        default:
          return acc;
      }
    }, []);
    if (types.length === options.length) {
      const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
      return {
        type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
        enum: options.reduce((acc, x) => {
          return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
        }, [])
      };
    }
  } else if (options.every((x) => x._def.typeName === "ZodEnum")) {
    return {
      type: "string",
      enum: options.reduce((acc, x) => [
        ...acc,
        ...x._def.values.filter((x2) => !acc.includes(x2))
      ], [])
    };
  }
  return asAnyOf(def, refs);
}
var asAnyOf = (def, refs) => {
  const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i) => parseDef(x._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", `${i}`]
  })).filter((x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
  return anyOf.length ? { anyOf } : void 0;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/nullable.js
function parseNullableDef(def, refs) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
    if (refs.target === "openApi3") {
      return {
        type: primitiveMappings[def.innerType._def.typeName],
        nullable: true
      };
    }
    return {
      type: [
        primitiveMappings[def.innerType._def.typeName],
        "null"
      ]
    };
  }
  if (refs.target === "openApi3") {
    const base2 = parseDef(def.innerType._def, {
      ...refs,
      currentPath: [...refs.currentPath]
    });
    if (base2 && "$ref" in base2)
      return { allOf: [base2], nullable: true };
    return base2 && { ...base2, nullable: true };
  }
  const base = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "0"]
  });
  return base && { anyOf: [base, { type: "null" }] };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/number.js
function parseNumberDef(def, refs) {
  const res = {
    type: "number"
  };
  if (!def.checks)
    return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "int":
        res.type = "integer";
        addErrorMessage(res, "type", check.message, refs);
        break;
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check.inclusive) {
            setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
          }
        } else {
          if (!check.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/object.js
function parseObjectDef(def, refs) {
  const forceOptionalIntoNullable = refs.target === "openAi";
  const result = {
    type: "object",
    properties: {}
  };
  const required = [];
  const shape = def.shape();
  for (const propName in shape) {
    let propDef = shape[propName];
    if (propDef === void 0 || propDef._def === void 0) {
      continue;
    }
    let propOptional = safeIsOptional(propDef);
    if (propOptional && forceOptionalIntoNullable) {
      if (propDef._def.typeName === "ZodOptional") {
        propDef = propDef._def.innerType;
      }
      if (!propDef.isNullable()) {
        propDef = propDef.nullable();
      }
      propOptional = false;
    }
    const parsedDef = parseDef(propDef._def, {
      ...refs,
      currentPath: [...refs.currentPath, "properties", propName],
      propertyPath: [...refs.currentPath, "properties", propName]
    });
    if (parsedDef === void 0) {
      continue;
    }
    result.properties[propName] = parsedDef;
    if (!propOptional) {
      required.push(propName);
    }
  }
  if (required.length) {
    result.required = required;
  }
  const additionalProperties = decideAdditionalProperties(def, refs);
  if (additionalProperties !== void 0) {
    result.additionalProperties = additionalProperties;
  }
  return result;
}
function decideAdditionalProperties(def, refs) {
  if (def.catchall._def.typeName !== "ZodNever") {
    return parseDef(def.catchall._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    });
  }
  switch (def.unknownKeys) {
    case "passthrough":
      return refs.allowedAdditionalProperties;
    case "strict":
      return refs.rejectedAdditionalProperties;
    case "strip":
      return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
  }
}
function safeIsOptional(schema) {
  try {
    return schema.isOptional();
  } catch {
    return true;
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/optional.js
var parseOptionalDef = (def, refs) => {
  if (refs.currentPath.toString() === refs.propertyPath?.toString()) {
    return parseDef(def.innerType._def, refs);
  }
  const innerSchema = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "1"]
  });
  return innerSchema ? {
    anyOf: [
      {
        not: parseAnyDef(refs)
      },
      innerSchema
    ]
  } : parseAnyDef(refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/pipeline.js
var parsePipelineDef = (def, refs) => {
  if (refs.pipeStrategy === "input") {
    return parseDef(def.in._def, refs);
  } else if (refs.pipeStrategy === "output") {
    return parseDef(def.out._def, refs);
  }
  const a = parseDef(def.in._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", "0"]
  });
  const b = parseDef(def.out._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", a ? "1" : "0"]
  });
  return {
    allOf: [a, b].filter((x) => x !== void 0)
  };
};

// node_modules/zod-to-json-schema/dist/esm/parsers/promise.js
function parsePromiseDef(def, refs) {
  return parseDef(def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/set.js
function parseSetDef(def, refs) {
  const items = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"]
  });
  const schema = {
    type: "array",
    uniqueItems: true,
    items
  };
  if (def.minSize) {
    setResponseValueAndErrors(schema, "minItems", def.minSize.value, def.minSize.message, refs);
  }
  if (def.maxSize) {
    setResponseValueAndErrors(schema, "maxItems", def.maxSize.value, def.maxSize.message, refs);
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/tuple.js
function parseTupleDef(def, refs) {
  if (def.rest) {
    return {
      type: "array",
      minItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], []),
      additionalItems: parseDef(def.rest._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalItems"]
      })
    };
  } else {
    return {
      type: "array",
      minItems: def.items.length,
      maxItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], [])
    };
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/undefined.js
function parseUndefinedDef(refs) {
  return {
    not: parseAnyDef(refs)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/unknown.js
function parseUnknownDef(refs) {
  return parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/readonly.js
var parseReadonlyDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/selectParser.js
var selectParser = (def, typeName, refs) => {
  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      return parseStringDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNumber:
      return parseNumberDef(def, refs);
    case ZodFirstPartyTypeKind.ZodObject:
      return parseObjectDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBigInt:
      return parseBigintDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBoolean:
      return parseBooleanDef();
    case ZodFirstPartyTypeKind.ZodDate:
      return parseDateDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUndefined:
      return parseUndefinedDef(refs);
    case ZodFirstPartyTypeKind.ZodNull:
      return parseNullDef(refs);
    case ZodFirstPartyTypeKind.ZodArray:
      return parseArrayDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUnion:
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return parseUnionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodIntersection:
      return parseIntersectionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodTuple:
      return parseTupleDef(def, refs);
    case ZodFirstPartyTypeKind.ZodRecord:
      return parseRecordDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLiteral:
      return parseLiteralDef(def, refs);
    case ZodFirstPartyTypeKind.ZodEnum:
      return parseEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNativeEnum:
      return parseNativeEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNullable:
      return parseNullableDef(def, refs);
    case ZodFirstPartyTypeKind.ZodOptional:
      return parseOptionalDef(def, refs);
    case ZodFirstPartyTypeKind.ZodMap:
      return parseMapDef(def, refs);
    case ZodFirstPartyTypeKind.ZodSet:
      return parseSetDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLazy:
      return () => def.getter()._def;
    case ZodFirstPartyTypeKind.ZodPromise:
      return parsePromiseDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNaN:
    case ZodFirstPartyTypeKind.ZodNever:
      return parseNeverDef(refs);
    case ZodFirstPartyTypeKind.ZodEffects:
      return parseEffectsDef(def, refs);
    case ZodFirstPartyTypeKind.ZodAny:
      return parseAnyDef(refs);
    case ZodFirstPartyTypeKind.ZodUnknown:
      return parseUnknownDef(refs);
    case ZodFirstPartyTypeKind.ZodDefault:
      return parseDefaultDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBranded:
      return parseBrandedDef(def, refs);
    case ZodFirstPartyTypeKind.ZodReadonly:
      return parseReadonlyDef(def, refs);
    case ZodFirstPartyTypeKind.ZodCatch:
      return parseCatchDef(def, refs);
    case ZodFirstPartyTypeKind.ZodPipeline:
      return parsePipelineDef(def, refs);
    case ZodFirstPartyTypeKind.ZodFunction:
    case ZodFirstPartyTypeKind.ZodVoid:
    case ZodFirstPartyTypeKind.ZodSymbol:
      return void 0;
    default:
      return /* @__PURE__ */ ((_) => void 0)(typeName);
  }
};

// node_modules/zod-to-json-schema/dist/esm/parseDef.js
function parseDef(def, refs, forceResolution = false) {
  const seenItem = refs.seen.get(def);
  if (refs.override) {
    const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
    if (overrideResult !== ignoreOverride) {
      return overrideResult;
    }
  }
  if (seenItem && !forceResolution) {
    const seenSchema = get$ref(seenItem, refs);
    if (seenSchema !== void 0) {
      return seenSchema;
    }
  }
  const newItem = { def, path: refs.currentPath, jsonSchema: void 0 };
  refs.seen.set(def, newItem);
  const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
  const jsonSchema = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
  if (jsonSchema) {
    addMeta(def, refs, jsonSchema);
  }
  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema, def, refs);
    newItem.jsonSchema = jsonSchema;
    return postProcessResult;
  }
  newItem.jsonSchema = jsonSchema;
  return jsonSchema;
}
var get$ref = (item, refs) => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (item.path.length < refs.currentPath.length && item.path.every((value, index) => refs.currentPath[index] === value)) {
        console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
        return parseAnyDef(refs);
      }
      return refs.$refStrategy === "seen" ? parseAnyDef(refs) : void 0;
    }
  }
};
var addMeta = (def, refs, jsonSchema) => {
  if (def.description) {
    jsonSchema.description = def.description;
    if (refs.markdownDescription) {
      jsonSchema.markdownDescription = def.description;
    }
  }
  return jsonSchema;
};

// node_modules/zod-to-json-schema/dist/esm/zodToJsonSchema.js
var zodToJsonSchema = (schema, options) => {
  const refs = getRefs(options);
  let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name2, schema2]) => ({
    ...acc,
    [name2]: parseDef(schema2._def, {
      ...refs,
      currentPath: [...refs.basePath, refs.definitionPath, name2]
    }, true) ?? parseAnyDef(refs)
  }), {}) : void 0;
  const name = typeof options === "string" ? options : options?.nameStrategy === "title" ? void 0 : options?.name;
  const main = parseDef(schema._def, name === void 0 ? refs : {
    ...refs,
    currentPath: [...refs.basePath, refs.definitionPath, name]
  }, false) ?? parseAnyDef(refs);
  const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
  if (title !== void 0) {
    main.title = title;
  }
  if (refs.flags.hasReferencedOpenAiAnyType) {
    if (!definitions) {
      definitions = {};
    }
    if (!definitions[refs.openAiAnyTypeName]) {
      definitions[refs.openAiAnyTypeName] = {
        // Skipping "object" as no properties can be defined and additionalProperties must be "false"
        type: ["string", "number", "integer", "boolean", "array", "null"],
        items: {
          $ref: refs.$refStrategy === "relative" ? "1" : [
            ...refs.basePath,
            refs.definitionPath,
            refs.openAiAnyTypeName
          ].join("/")
        }
      };
    }
  }
  const combined = name === void 0 ? definitions ? {
    ...main,
    [refs.definitionPath]: definitions
  } : main : {
    $ref: [
      ...refs.$refStrategy === "relative" ? [] : refs.basePath,
      refs.definitionPath,
      name
    ].join("/"),
    [refs.definitionPath]: {
      ...definitions,
      [name]: main
    }
  };
  if (refs.target === "jsonSchema7") {
    combined.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (refs.target === "jsonSchema2019-09" || refs.target === "openAi") {
    combined.$schema = "https://json-schema.org/draft/2019-09/schema#";
  }
  if (refs.target === "openAi" && ("anyOf" in combined || "oneOf" in combined || "allOf" in combined || "type" in combined && Array.isArray(combined.type))) {
    console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
  }
  return combined;
};

// src/kit/feature.ts
function flPath(targetDir) {
  return resolveProjectPaths(targetDir).featureListPath;
}
function listFeatures(targetDir) {
  return loadFeatureList(flPath(targetDir));
}
function formatFeatureList(doc) {
  const lines = [];
  lines.push(`Project: ${doc.project}  VCR: ${(verifiedCompletionRate(doc) * 100).toFixed(0)}%`);
  const sorted = [...doc.features].sort((a, b) => a.priority - b.priority);
  for (const f of sorted) {
    lines.push(`[${f.status.padEnd(11)}] ${f.id.padEnd(16)} p${f.priority}  ${f.title}`);
  }
  return lines.join("\n");
}
function formatFeatureDag(doc) {
  const lines = ["graph TD"];
  const shape = (f) => {
    const label = `${f.id}: ${f.title.replace(/"/g, "'")}`;
    if (f.status === "passing") return `${f.id}(["\u2713 ${label}"])`;
    if (f.status === "in_progress") return `${f.id}["\u25B6 ${label}"]`;
    if (f.status === "blocked") return `${f.id}{{"\u2717 ${label}"}}`;
    return `${f.id}["${label}"]`;
  };
  for (const f of doc.features) lines.push(`  ${shape(f)}`);
  for (const f of doc.features) {
    for (const dep of f.dependsOn) {
      const unmet = unmetDependencies(doc, f).includes(dep);
      lines.push(`  ${dep} -->${unmet ? "|unmet|" : ""} ${f.id}`);
    }
  }
  return lines.join("\n");
}
function branchExists(root, branch) {
  try {
    (0, import_node_child_process8.execFileSync)("git", ["rev-parse", "--verify", branch], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function createFeatureWorktree(targetDir, id) {
  const paths = resolveProjectPaths(targetDir);
  const worktreePath = path25.join(paths.worktreesDir, id);
  if (fs25.existsSync(worktreePath)) return worktreePath;
  ensureWorktreesGitignored(paths.root);
  const branch = `feature/${id}`;
  fs25.mkdirSync(path25.dirname(worktreePath), { recursive: true });
  try {
    if (branchExists(paths.root, branch)) {
      (0, import_node_child_process8.execFileSync)("git", ["worktree", "add", worktreePath, branch], { cwd: paths.root, stdio: "ignore" });
    } else {
      (0, import_node_child_process8.execFileSync)("git", ["worktree", "add", "-b", branch, worktreePath, "HEAD"], { cwd: paths.root, stdio: "ignore" });
    }
  } catch (err) {
    let hasCommit = true;
    try {
      (0, import_node_child_process8.execFileSync)("git", ["rev-parse", "HEAD"], { cwd: paths.root, stdio: "ignore" });
    } catch {
      hasCommit = false;
    }
    if (!hasCommit) {
      throw new FeatureListError(
        `ERROR: cannot create a worktree for "${id}" \u2014 this repo has no commits yet.
WHY: \`git worktree add\` needs a starting commit (HEAD); a repo with no commits has none.
FIX: make one commit first (\`hx init\` does this automatically), then retry.`
      );
    }
    throw err;
  }
  new EventLog(paths.hxDir).append("feature.worktree", { id, path: worktreePath, branch });
  return worktreePath;
}
function pruneFeatureWorktrees(targetDir, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  try {
    (0, import_node_child_process8.execFileSync)("git", ["worktree", "prune"], { cwd: paths.root, stdio: "ignore", timeout: 3e4 });
  } catch {
    return [];
  }
  if (!fs25.existsSync(paths.worktreesDir)) return [];
  let doc = null;
  try {
    doc = fs25.existsSync(paths.featureListPath) ? loadFeatureList(paths.featureListPath) : null;
  } catch {
    doc = null;
  }
  const stale = [];
  for (const entry of fs25.readdirSync(paths.worktreesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const feature2 = doc?.features.find((f) => f.id === id);
    const worktreePath = path25.join(paths.worktreesDir, id);
    if (!feature2) {
      stale.push({ id, path: worktreePath, reason: "feature not found in feature list" });
    } else if (feature2.status !== "in_progress") {
      stale.push({ id, path: worktreePath, reason: "feature no longer in_progress" });
    }
  }
  if (!opts.dryRun) {
    const eventLog = new EventLog(paths.hxDir);
    for (const s of stale) {
      try {
        (0, import_node_child_process8.execFileSync)("git", ["worktree", "remove", s.path], { cwd: paths.root, stdio: "ignore", timeout: 3e4 });
        eventLog.append("feature.worktree-pruned", { id: s.id, path: s.path, reason: s.reason });
      } catch {
      }
    }
  }
  return stale;
}
function cmdStart(targetDir, id, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const doc = loadFeatureList(paths.featureListPath);
  const vcrGate = paths.kitConfig?.vcrGate ?? "warn";
  const { vcrWarning } = startFeature(doc, id, { vcrGate });
  const feature2 = doc.features.find((f) => f.id === id);
  if (isAdvancedPack(paths.root)) {
    const planRel2 = opts.plan ?? feature2.plan;
    if (!planRel2) {
      throw new FeatureListError(
        `ERROR: "${id}" has no plan, and this project uses the advanced pack.
WHY: docs/PLANS.md \u2014 work spanning more than one session needs an execution plan, not just a scope.
FIX: hx plan new <topic>, then hx feature start ${id} --plan <the plan file it prints>.`
      );
    }
    if (!fs25.existsSync(path25.isAbsolute(planRel2) ? planRel2 : path25.join(paths.root, planRel2))) {
      throw new FeatureListError(`ERROR: "${id}"'s plan (${planRel2}) does not exist.
FIX: hx plan new <topic>, or correct the path.`);
    }
    feature2.plan = planRel2;
  }
  const exclusions = computeExclusions(doc, id, paths.kitConfig);
  feature2.contractHash = writeContract(targetDir, "feature", id, feature2.title, feature2.scope, feature2.verification, exclusions);
  saveFeatureList(paths.featureListPath, doc);
  new EventLog(paths.hxDir).append("feature.start", { id, vcrWarning, plan: feature2.plan });
  const worktreePath = opts.worktree ? createFeatureWorktree(targetDir, id) : null;
  return { vcrWarning, worktreePath };
}
function cmdBlock(targetDir, id, reason) {
  const paths = resolveProjectPaths(targetDir);
  const doc = loadFeatureList(paths.featureListPath);
  const feature2 = doc.features.find((f) => f.id === id);
  blockFeature(doc, id, reason);
  saveFeatureList(paths.featureListPath, doc);
  new EventLog(paths.hxDir).append("feature.block", { id, reason });
  appendLesson(targetDir, { source: "feature.block", id, title: feature2?.title ?? id, reason });
  appendDecision(targetDir, { title: `Blocked feature "${feature2?.title ?? id}"`, reason });
}
function cmdReopen(targetDir, id, reason) {
  const paths = resolveProjectPaths(targetDir);
  const doc = loadFeatureList(paths.featureListPath);
  reopenFeature(doc, id, reason);
  saveFeatureList(paths.featureListPath, doc);
  new EventLog(paths.hxDir).append("feature.reopen", { id, reason, actor: "human" });
}
function resetProgressLog(progressPath) {
  if (!fs25.existsSync(progressPath)) return;
  const content = fs25.readFileSync(progressPath, "utf-8");
  const heading = "## Session Log";
  const idx = content.indexOf(heading);
  if (idx === -1) return;
  const afterHeadingStart = idx + heading.length;
  const commentMatch = content.slice(afterHeadingStart).match(/^\s*\n<!--[\s\S]*?-->\n?/);
  const keepThrough = afterHeadingStart + (commentMatch ? commentMatch[0].length : 0);
  fs25.writeFileSync(progressPath, content.slice(0, keepThrough).trimEnd() + "\n", "utf-8");
}
function cmdResetAll(targetDir) {
  const paths = resolveProjectPaths(targetDir);
  const doc = loadFeatureList(paths.featureListPath);
  resetAllFeatures(doc);
  saveFeatureList(paths.featureListPath, doc);
  resetProgressLog(paths.progressPath);
  new EventLog(paths.hxDir).append("feature.reset-all", { count: doc.features.length, actor: "human" });
  return { resetCount: doc.features.length };
}
function featureListJsonSchema() {
  return zodToJsonSchema(FeatureListDoc, "FeatureListDoc");
}

// src/kit/start.ts
function currentBranch(root) {
  try {
    return (0, import_node_child_process9.execFileSync)("git", ["branch", "--show-current"], { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "(detached)";
  } catch {
    return "(no git)";
  }
}
function currentHead(root) {
  try {
    return (0, import_node_child_process9.execFileSync)("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "(no commits)";
  }
}
function currentDirtyCount(root) {
  try {
    const out = (0, import_node_child_process9.execFileSync)("git", ["status", "--porcelain"], { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}
function configHash(root) {
  const p = path26.join(root, ".claude", "hx.config.json");
  try {
    return crypto3.createHash("sha1").update(fs26.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}
function runStart(targetDir, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const eventLog = new EventLog(paths.hxDir);
  const priorStarts = eventLog.readByType("start");
  const lastStart = priorStarts[priorStarts.length - 1];
  const isFirstStart = !lastStart;
  const showFull = isFirstStart || opts.full === true;
  const hookErrorEvents = eventLog.readByType("hook.error").filter((e) => !lastStart || e.ts > lastStart.ts);
  const hookErrorCount = hookErrorEvents.length;
  const lastEvt = hookErrorEvents[hookErrorEvents.length - 1];
  const lastHookError = lastEvt ? { hook: String(lastEvt.hook), message: String(lastEvt.message) } : null;
  const branch = currentBranch(paths.root);
  const head = currentHead(paths.root);
  const dirtyCount = currentDirtyCount(paths.root);
  const cfgHash = configHash(paths.root);
  let progressExcerpt = null;
  let progressChangedSinceLastStart = false;
  if (fs26.existsSync(paths.progressPath)) {
    if (showFull) {
      progressExcerpt = fs26.readFileSync(paths.progressPath, "utf-8").split("\n").slice(0, 15).join("\n");
    } else {
      const stat = fs26.statSync(paths.progressPath);
      progressChangedSinceLastStart = !lastStart || stat.mtimeMs > new Date(lastStart.ts).getTime();
    }
  }
  let recentCommits = [];
  if (showFull) {
    try {
      const out = (0, import_node_child_process9.execFileSync)("git", ["log", "--oneline", "-5"], { cwd: paths.root, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      recentCommits = out.split("\n").filter(Boolean);
    } catch {
      recentCommits = [];
    }
  }
  const initResults = runInitChecks(paths.root);
  const initCheckFailures = initResults.filter((r) => !r.passed).length;
  let staleWorktreeCount = 0;
  try {
    staleWorktreeCount = pruneFeatureWorktrees(paths.root, { dryRun: true }).length;
  } catch {
    staleWorktreeCount = 0;
  }
  let nextFeatureId = null;
  let nextFeatureTitle = null;
  let activeFeatureId = null;
  if (fs26.existsSync(paths.featureListPath)) {
    const doc = loadFeatureList(paths.featureListPath);
    const active = activeFeature(doc);
    if (active) {
      activeFeatureId = active.id;
    } else {
      const next = pickNext(doc);
      if (next) {
        nextFeatureId = next.id;
        nextFeatureTitle = next.title;
      }
    }
  }
  const checkCmd = paths.kitConfig?.commands.check;
  let baselineSmoke = null;
  if (checkCmd) {
    const timeout = paths.kitConfig?.verifyTimeoutMs ?? 6e5;
    let passed = true;
    try {
      (0, import_node_child_process9.execSync)(checkCmd, { cwd: paths.root, stdio: ["ignore", "pipe", "pipe"], timeout });
    } catch {
      passed = false;
    }
    baselineSmoke = { ran: true, passed, cmd: checkCmd };
  }
  const recentLessons = readRecentLessons(targetDir, 3);
  const recentDecisions = readRecentDecisions(targetDir, 3);
  const decisionKey = (d) => `${d.date}|${d.title}`;
  const lessonKey = (l) => `${l.date}|${l.id}`;
  const prevDecisionKeys = Array.isArray(lastStart?.recentDecisionKeys) ? lastStart.recentDecisionKeys : [];
  const prevLessonKeys = Array.isArray(lastStart?.recentLessonKeys) ? lastStart.recentLessonKeys : [];
  const newDecisions = showFull ? [] : recentDecisions.filter((d) => !prevDecisionKeys.includes(decisionKey(d)));
  const newLessons = showFull ? [] : recentLessons.filter((l) => !prevLessonKeys.includes(lessonKey(l)));
  eventLog.append("start", {
    initCheckFailures,
    nextFeatureId,
    activeFeatureId,
    baselineSmoke,
    branch,
    head,
    dirtyCount,
    configHash: cfgHash,
    recentDecisionKeys: recentDecisions.map(decisionKey),
    recentLessonKeys: recentLessons.map(lessonKey)
  });
  const prevBranch = lastStart?.branch;
  const prevHead = lastStart?.head;
  const prevDirty = typeof lastStart?.dirtyCount === "number" ? lastStart.dirtyCount : void 0;
  const prevConfigHash = lastStart?.configHash;
  return {
    cwd: paths.root,
    layout: paths.layout,
    progressExcerpt,
    recentCommits,
    initCheckFailures,
    nextFeatureId,
    nextFeatureTitle,
    activeFeatureId,
    hookErrorCount,
    lastHookError,
    recentLessons,
    recentDecisions,
    baselineSmoke,
    lowestQualityGrade: lowestQualityGrade(paths),
    staleWorktreeCount,
    full: showFull,
    delta: showFull ? null : {
      branchChanged: prevBranch !== void 0 && prevBranch !== branch ? { from: prevBranch, to: branch } : null,
      headChanged: prevHead !== void 0 && prevHead !== head ? { from: prevHead, to: head } : null,
      dirtyCountChanged: prevDirty !== void 0 && prevDirty !== dirtyCount ? { from: prevDirty, to: dirtyCount } : null,
      configChanged: prevConfigHash !== void 0 && prevConfigHash !== cfgHash,
      newDecisions,
      newLessons,
      progressChangedSinceLastStart
    }
  };
}
function formatStartDelta(r) {
  const d = r.delta;
  const lines = [];
  lines.push(`Working directory: ${r.cwd}`);
  const changes = [];
  if (d.branchChanged) changes.push(`branch: ${d.branchChanged.from} -> ${d.branchChanged.to}`);
  if (d.headChanged) changes.push(`HEAD: ${d.headChanged.from} -> ${d.headChanged.to}`);
  if (d.dirtyCountChanged) changes.push(`dirty files: ${d.dirtyCountChanged.from} -> ${d.dirtyCountChanged.to}`);
  if (d.configChanged) changes.push("hx.config.json changed");
  if (d.progressChangedSinceLastStart) changes.push("progress log updated since last start");
  lines.push(changes.length > 0 ? `Since last start: ${changes.join("; ")}.` : "Since last start: nothing changed.");
  if (r.initCheckFailures > 0) {
    lines.push(`Init prerequisite failures: ${r.initCheckFailures} \u2014 fix the baseline before starting new feature work (\`hx doctor\` for detail).`);
  }
  if (r.baselineSmoke && !r.baselineSmoke.passed) {
    lines.push(`Baseline smoke check: FAIL (${r.baselineSmoke.cmd}) \u2014 fix this before starting new feature work.`);
  }
  if (r.staleWorktreeCount > 0) {
    lines.push(`${r.staleWorktreeCount} stale feature worktree(s) \u2014 \`hx worktree prune\`.`);
  }
  if (r.hookErrorCount > 0) {
    lines.push(
      `WARNING: ${r.hookErrorCount} hook error(s) since last session \u2014 the harness may not have been enforcing something. Last: [${r.lastHookError.hook}] ${r.lastHookError.message} (run \`hx doctor\` for detail).`
    );
  }
  for (const dec of d.newDecisions) lines.push(`New decision [${dec.date}] ${dec.title}${dec.reason ? `: ${dec.reason}` : ""}`);
  for (const l of d.newLessons) lines.push(`New lesson [${l.date}] ${l.title} (${l.id}): ${l.reason}`);
  if (r.activeFeatureId) {
    lines.push(`Active feature (WIP=1): ${r.activeFeatureId} \u2014 continue this, do not start another.`);
  } else if (r.nextFeatureId) {
    lines.push(`Next feature to start: ${r.nextFeatureId} \u2014 ${r.nextFeatureTitle}`);
    lines.push(`Run: hx feature start ${r.nextFeatureId}`);
  } else {
    lines.push("No unstarted feature found. Check the feature list.");
  }
  lines.push("(Full report: `hx start --full`.)");
  return lines.join("\n");
}
function formatStartReport(r) {
  if (!r.full) return formatStartDelta(r);
  const lines = [];
  lines.push(`Working directory: ${r.cwd}`);
  lines.push("");
  if (r.progressExcerpt) {
    lines.push("--- progress (excerpt) ---");
    lines.push(r.progressExcerpt);
    lines.push("");
  } else {
    lines.push(
      r.layout === "kit" ? "No progress log yet \u2014 this is the first session. It is written automatically when the session ends." : "No progress log found \u2014 run `hx init` to create one."
    );
  }
  lines.push("--- recent commits ---");
  lines.push(r.recentCommits.length > 0 ? r.recentCommits.join("\n") : "(no git history)");
  lines.push("");
  lines.push(`Init prerequisite failures: ${r.initCheckFailures}`);
  if (r.initCheckFailures > 0) {
    lines.push("Fix the baseline before starting new feature work (`hx doctor` for detail).");
  }
  if (r.baselineSmoke) {
    lines.push(
      r.baselineSmoke.passed ? `Baseline smoke check: PASS (${r.baselineSmoke.cmd})` : `Baseline smoke check: FAIL (${r.baselineSmoke.cmd}) \u2014 fix this before starting new feature work.`
    );
  } else {
    lines.push("Baseline smoke check: not configured (set commands.check in .claude/hx.config.json to enable).");
  }
  if (r.lowestQualityGrade) {
    lines.push(`Lowest QUALITY_SCORE.md grade: ${r.lowestQualityGrade} (\`hx doctor\` or docs/QUALITY_SCORE.md for detail).`);
  }
  if (r.staleWorktreeCount > 0) {
    lines.push(`${r.staleWorktreeCount} stale feature worktree(s) under .hx-worktrees/ \u2014 run \`hx worktree prune\` to clean up.`);
  }
  if (r.hookErrorCount > 0) {
    lines.push(
      `WARNING: ${r.hookErrorCount} hook error(s) since last session \u2014 the harness may not have been enforcing something. Last: [${r.lastHookError.hook}] ${r.lastHookError.message} (run \`hx doctor\` for detail).`
    );
  }
  if (r.recentDecisions.length > 0) {
    lines.push("");
    lines.push("--- recent decisions ---");
    for (const d of r.recentDecisions) lines.push(`  [${d.date}] ${d.title}${d.reason ? `: ${d.reason}` : ""}`);
  }
  if (r.recentLessons.length > 0) {
    lines.push("");
    lines.push("--- recent lessons ---");
    for (const l of r.recentLessons) lines.push(`  [${l.date}] ${l.title} (${l.id}): ${l.reason}`);
  }
  lines.push("");
  if (r.activeFeatureId) {
    lines.push(`Active feature (WIP=1): ${r.activeFeatureId} \u2014 continue this, do not start another.`);
  } else if (r.nextFeatureId) {
    lines.push(`Next feature to start: ${r.nextFeatureId} \u2014 ${r.nextFeatureTitle}`);
    lines.push(`Run: hx feature start ${r.nextFeatureId}`);
  } else {
    lines.push("No unstarted feature found. Check the feature list.");
  }
  return lines.join("\n");
}

// src/kit/verify.ts
var import_node_child_process10 = require("node:child_process");
var ContractChangedError = class extends FeatureListError {
};
var EvaluationBlockedError = class extends FeatureListError {
};
var ThinAttestationError = class extends FeatureListError {
};
var THIN_ATTEST_WARN_CHARS = 40;
function isThinAttestation(note) {
  return (note ?? "").length < THIN_ATTEST_WARN_CHARS;
}
function currentCommit(cwd) {
  try {
    return (0, import_node_child_process10.execFileSync)("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return void 0;
  }
}
function cmdVerify(targetDir, id, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const doc = loadFeatureList(paths.featureListPath);
  const feature2 = doc.features.find((f) => f.id === id);
  if (!feature2) throw new FeatureListError(`No such feature: ${id}`);
  if (opts.attest) {
    const min = paths.kitConfig?.attestMinChars;
    const chars = (opts.attestNote ?? "").length;
    if (min && min > 0 && chars < min) {
      throw new ThinAttestationError(
        `ERROR: attestation note for "${id}" is ${chars} character(s), below this project's configured minimum of ${min}.
WHY: .claude/hx.config.json sets attestMinChars: ${min} \u2014 a short note ("checked in browser") doesn't say what was actually observed, and this project has chosen to enforce that mechanically.
FIX: hx verify ${id} --attest "<a longer note with concrete numbers, e.g. 'sidebar collapses at 768px, drawer traps focus, 0 console errors'>" (at least ${min} characters).`
      );
    }
  }
  const exclusions = computeExclusions(doc, id, paths.kitConfig);
  if (contractChanged(feature2, exclusions)) {
    if (!opts.acceptContractChange) {
      throw new ContractChangedError(
        `ERROR: "${id}"'s scope or verification commands changed since it was started.
WHY: CLAUDE.md's rule \u2014 "do not silently change verification rules during implementation" \u2014 made mechanical. A sprint contract was written when this feature started; the current scope/verification no longer matches it.
FIX: hx verify ${id} --accept-contract-change --reason "<why the change was needed>"`
      );
    }
    const eventLog2 = new EventLog(paths.hxDir);
    eventLog2.append("contract.changed", { id, reason: opts.reason ?? "(no reason given)" });
    appendDecision(targetDir, {
      title: `Changed the verification contract for "${feature2.title}"`,
      reason: opts.reason ?? "(no reason given)"
    });
    feature2.contractHash = writeContract(targetDir, "feature", id, feature2.title, feature2.scope, feature2.verification, exclusions);
  }
  const ladder = runVerificationLadder(feature2, paths.root, { ...opts, timeoutMs: paths.kitConfig?.verifyTimeoutMs });
  const commit = currentCommit(paths.root);
  const evidenceWithCommit = ladder.evidence.map((e) => ({ ...e, commit }));
  const eventLog = new EventLog(paths.hxDir);
  let evaluation = null;
  if (ladder.allPassed) {
    markPassing(doc, id, evidenceWithCommit);
    saveFeatureList(paths.featureListPath, doc);
    const fastLevelResults = ladder.results.filter((r) => r.level === "static" || r.level === "unit");
    const knownReliabilityFirstRun = fastLevelResults.length > 0 ? fastLevelResults.every((r) => r.ran && r.passed) : void 0;
    evaluation = cmdEvaluate(targetDir, id, { knownReliabilityFirstRun });
    if (evaluation.verdict === "Block") {
      feature2.status = "in_progress";
      saveFeatureList(paths.featureListPath, doc);
    }
  } else {
    feature2.evidence.push(...evidenceWithCommit);
    saveFeatureList(paths.featureListPath, doc);
  }
  const diffHash = verificationFingerprint(paths.root);
  eventLog.append("verify", {
    id,
    allPassed: ladder.allPassed,
    rootCauseLevel: ladder.rootCauseLevel,
    commit,
    diffHash,
    // (verify-004) recorded only when --attest was actually used — never a fake 0 on a run that
    // had no attestation at all, which would be indistinguishable from a genuinely empty note.
    ...opts.attest ? { attestNote: opts.attestNote ?? "", attestNoteChars: (opts.attestNote ?? "").length } : {}
  });
  if (ladder.allPassed && evaluation?.verdict !== "Block") {
    eventLog.append("feature.pass", { id, commit });
  }
  if (evaluation?.verdict === "Block") {
    throw new EvaluationBlockedError(
      `ERROR: verification passed, but the evaluator rubric verdict for "${id}" is Block.
WHY: ${evaluation.scores.filter((s) => s.score === 0).map((s) => `${s.category}: ${s.notes}`).join(" | ")}
FIX: address the above, then re-run hx verify ${id}. See the evaluation file for the full rubric:
${formatEvaluation(evaluation)}`
    );
  }
  return ladder;
}

// src/kit/env-check.ts
var fs27 = __toESM(require("node:fs"), 1);
var path27 = __toESM(require("node:path"), 1);
var ENV_FILENAME_RE = /^\.env(\..+)?$/;
var EnvCheckError = class extends Error {
};
function parseEnvFile(content) {
  const out = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length) : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out.push({ key, rawValue: withoutExport.slice(eq + 1) });
  }
  return out;
}
function shapeOf(rawValue) {
  const outerTrimmed = rawValue.trim();
  let quoted = "none";
  let effective = rawValue;
  if (outerTrimmed.length >= 2 && outerTrimmed.startsWith('"') && outerTrimmed.endsWith('"')) {
    quoted = "double";
    effective = outerTrimmed.slice(1, -1);
  } else if (outerTrimmed.length >= 2 && outerTrimmed.startsWith("'") && outerTrimmed.endsWith("'")) {
    quoted = "single";
    effective = outerTrimmed.slice(1, -1);
  }
  const trailingComment = quoted === "none" && / #/.test(rawValue);
  return {
    length: effective.length,
    leadingOrTrailingWhitespace: effective !== effective.trim(),
    quoted,
    trailingComment,
    empty: effective.length === 0
  };
}
function validateEnvFileName(requested) {
  const base = path27.basename(requested);
  if (base !== requested || !ENV_FILENAME_RE.test(base)) {
    throw new EnvCheckError(
      `ERROR: "${requested}" is not a valid --file value.
WHY: env file names are restricted to a bare basename matching /^\\.env(\\..+)?$/ (e.g. ".env", ".env.local", ".env.production") that resolves inside the project root \u2014 this stops --file from being used to read an arbitrary path.
FIX: pass a bare filename like ".env.production", not a path.`
    );
  }
  return base;
}
function checkEnv(root, keys, opts = {}) {
  const resolved = path27.resolve(root);
  const requestedFiles = opts.files && opts.files.length > 0 ? opts.files : [".env", ".env.local"];
  const fileBasenames = requestedFiles.map(validateEnvFileName);
  const filesChecked = [];
  const filesRequestedButMissing = [];
  const keyNamesByFile = {};
  const perKeyFiles = /* @__PURE__ */ new Map();
  for (const base of fileBasenames) {
    const full = path27.join(resolved, base);
    let content;
    try {
      content = fs27.readFileSync(full, "utf-8");
    } catch {
      filesRequestedButMissing.push(base);
      continue;
    }
    filesChecked.push(base);
    const parsed = parseEnvFile(content);
    keyNamesByFile[base] = [...new Set(parsed.map((p) => p.key))];
    for (const { key, rawValue } of parsed) {
      const list = perKeyFiles.get(key) ?? [];
      list.push({ file: base, ...shapeOf(rawValue) });
      perKeyFiles.set(key, list);
    }
  }
  const keyReports = keys.map((key) => {
    const files = perKeyFiles.get(key) ?? [];
    const first = files[0] ?? null;
    return {
      key,
      present: files.length > 0,
      files,
      duplicateAcrossFiles: files.length > 1,
      length: first ? first.length : null,
      leadingOrTrailingWhitespace: first ? first.leadingOrTrailingWhitespace : null,
      quoted: first ? first.quoted : null,
      trailingComment: first ? first.trailingComment : null,
      empty: first ? first.empty : null
    };
  });
  const anyMissingOrEmpty = keyReports.some((k) => !k.present || k.empty === true);
  return { root: resolved, filesChecked, filesRequestedButMissing, keyNamesByFile, keys: keyReports, anyMissingOrEmpty };
}
function formatEnvCheck(result) {
  const lines = [];
  if (result.filesChecked.length === 0) {
    lines.push(`No env file found (looked for: ${result.filesRequestedButMissing.join(", ") || "(none requested)"}).`);
    if (result.keys.length === 0) return lines.join("\n");
  }
  if (result.keys.length === 0) {
    for (const file of result.filesChecked) {
      lines.push(`${file}:`);
      const names = keySort(result.keyNamesByFile[file] ?? []);
      if (names.length === 0) lines.push("  (no keys found)");
      for (const name of names) lines.push(`  ${name}`);
    }
    return lines.join("\n");
  }
  for (const k of result.keys) {
    if (!k.present) {
      lines.push(`${k.key}: MISSING (not found in ${result.filesChecked.join(", ") || "any checked file"})`);
      continue;
    }
    const flags = [];
    if (k.empty) flags.push("EMPTY");
    if (k.leadingOrTrailingWhitespace) flags.push("leading/trailing whitespace");
    if (k.trailingComment) flags.push("possible trailing comment (the WEB_CHAT_DAILY_LIMIT bug shape)");
    if (k.duplicateAcrossFiles) flags.push(`set in ${k.files.length} files: ${k.files.map((f) => f.file).join(", ")}`);
    lines.push(
      `${k.key}: present in ${k.files[0].file}, length ${k.length}, quoted: ${k.quoted}` + (flags.length > 0 ? ` \u2014 ${flags.join("; ")}` : "")
    );
  }
  return lines.join("\n");
}
function keySort(names) {
  return [...names].sort((a, b) => a.localeCompare(b));
}

// src/kit/exit.ts
var fs28 = __toESM(require("node:fs"), 1);
var path28 = __toESM(require("node:path"), 1);
var import_node_child_process11 = require("node:child_process");
var import_picomatch4 = __toESM(require_picomatch2(), 1);
function handoffHasNextStep(handoffPath) {
  try {
    const text = fs28.readFileSync(handoffPath, "utf-8");
    const m = text.match(/Highest-priority unfinished feature:[ \t]*(.*)/);
    if (!m) return false;
    const value = m[1].trim();
    return value.length > 0 && value !== "(none)";
  } catch {
    return false;
  }
}
function tryRun(cmd, cwd, timeoutMs) {
  try {
    (0, import_node_child_process11.execSync)(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, encoding: "utf-8" });
    return { ok: true, detail: `\`${cmd}\` exited 0` };
  } catch (err) {
    const code = typeof err.status === "number" ? err.status : err.signal ? `signal ${err.signal}` : "unknown";
    return { ok: false, detail: `\`${cmd}\` failed (${code})` };
  }
}
function checkStartupPath(paths) {
  const hasScript = fs28.existsSync(path28.join(paths.root, "init.sh")) || fs28.existsSync(path28.join(paths.root, "init.ps1"));
  const startCmd = paths.kitConfig?.commands.start;
  const checkCmd = paths.kitConfig?.commands.check;
  if (!hasScript && !startCmd) {
    return {
      id: "startup-path",
      label: "Standard startup path still works",
      status: "fail",
      detail: "No init.sh, init.ps1, or commands.start configured \u2014 there is no documented way to start this project."
    };
  }
  if (checkCmd) {
    const timeout = paths.kitConfig?.verifyTimeoutMs ?? 6e5;
    const result = tryRun(checkCmd, paths.root, timeout);
    return {
      id: "startup-path",
      label: "Standard startup path still works",
      status: result.ok ? "pass" : "fail",
      detail: result.detail
    };
  }
  return {
    id: "startup-path",
    label: "Standard startup path still works",
    status: "pass",
    detail: hasScript ? "init.sh/init.ps1 present" : `commands.start configured: ${startCmd}`
  };
}
function checkVerificationPath(paths, eventLog) {
  const source = activeScopeSource(paths.root);
  let hasVerificationEntries = false;
  if (source?.kind === "feature" && fs28.existsSync(paths.featureListPath)) {
    const doc = loadFeatureList(paths.featureListPath);
    const feature2 = doc.features.find((f) => f.id === source.id);
    hasVerificationEntries = (feature2?.verification.length ?? 0) > 0;
  } else if (source?.kind === "issue") {
    hasVerificationEntries = true;
  }
  const recentEvents = eventLog.readAll();
  const lastVerify = [...recentEvents].reverse().find((e) => e.type === "verify" || e.type === "issue.verify");
  if (!lastVerify) {
    if (!hasVerificationEntries) {
      return {
        id: "verification-path",
        label: "Standard verification path still runs",
        status: "warn",
        detail: source ? `${source.kind} "${source.id}" has no verification command configured, and nothing has been verified yet.` : "No active feature or issue, and nothing has been verified yet \u2014 nothing to check."
      };
    }
    return {
      id: "verification-path",
      label: "Standard verification path still runs",
      status: "fail",
      detail: `ERROR: no verification has been run yet for "${source.id}".
  WHY: the harness cannot confirm the code works without a recorded verification run.
  FIX: hx verify ${source.id}` + (source.kind === "issue" ? ` (hx issue verify ${source.id})` : "")
    };
  }
  if (typeof lastVerify.diffHash !== "string") {
    return {
      id: "verification-path",
      label: "Standard verification path still runs",
      status: "warn",
      detail: "The most recent verification predates fingerprint tracking. Re-run hx verify to establish a baseline."
    };
  }
  const currentFingerprint = verificationFingerprint(paths.root);
  if (currentFingerprint !== lastVerify.diffHash) {
    return {
      id: "verification-path",
      label: "Standard verification path still runs",
      status: "fail",
      detail: `ERROR: the code changed since the last verification run.
  WHY: a passing verification only proves the code AT THAT TIME worked \u2014 edits made since then (through any tool) are unverified.
  FIX: hx verify` + (source ? ` ${source.id}` + (source.kind === "issue" ? ` (hx issue verify ${source.id})` : "") : " <id>")
    };
  }
  return {
    id: "verification-path",
    label: "Standard verification path still runs",
    status: "pass",
    detail: `Verified at ${lastVerify.ts}, and the tree has not changed since.`
  };
}
function checkNoUndocumentedChanges(paths, changedFiles, cleanupFindings) {
  const problems = [];
  const debugGate = paths.kitConfig?.debugCodeGate ?? { mode: "warn", paths: [] };
  const testGate = paths.kitConfig?.testGuard ?? "warn";
  let hasBlockingProblem = false;
  const criticalFindings = cleanupFindings.filter((f) => f.severity === "critical" && f.found.length > 0);
  if (criticalFindings.length > 0) {
    problems.push(`critical cleanup finding(s): ${criticalFindings.map((f) => `${f.check} (${f.found.join(", ")})`).join("; ")}`);
    hasBlockingProblem = true;
  }
  const source = activeScopeSource(paths.root);
  if (source && source.scope.length > 0) {
    const drift = checkDrift(paths.root, { id: source.id, scope: source.scope });
    if (drift.outOfScope.length > 0) {
      let handoffText = "";
      try {
        handoffText = fs28.readFileSync(paths.handoffPath, "utf-8");
      } catch {
        handoffText = "";
      }
      const undocumented = drift.outOfScope.filter((f) => !handoffText.includes(f));
      if (undocumented.length > 0) {
        problems.push(`out-of-scope change(s) not mentioned in the handoff: ${undocumented.join(", ")}`);
        hasBlockingProblem = true;
      }
    }
  }
  const debugFindings = scanChangedFilesForDebugCode(paths.root, changedFiles);
  if (debugFindings.length > 0) {
    const expandedGatePaths = debugGate.paths.flatMap((p) => {
      if (/[*?[\]{}]/.test(p)) return [p];
      const trimmed = p.replace(/\/+$/, "");
      return [p, `${trimmed}/**`];
    });
    const inGatedPath = expandedGatePaths.length > 0 ? (0, import_picomatch4.default)(expandedGatePaths) : () => false;
    const gated = debugFindings.filter((f) => inGatedPath(f.file));
    problems.push(
      `debug code left in changed file(s): ${debugFindings.map((f) => `${f.file}:${f.line} (${f.match})`).join(", ")}`
    );
    if (debugGate.mode === "block" && gated.length > 0) hasBlockingProblem = true;
  }
  const testFindings = scanForTestWeakening(paths.root, changedFiles);
  if (testFindings.length > 0) {
    problems.push(
      `possible test weakening: ${testFindings.map((f) => f.reason === "deleted" ? `${f.file} deleted` : `${f.file} ${f.before} -> ${f.after} test blocks`).join(", ")}`
    );
    if (testGate === "block") hasBlockingProblem = true;
  }
  if (problems.length === 0) {
    return {
      id: "no-undocumented-changes",
      label: "No half-finished step is left undocumented",
      status: "pass",
      detail: "No undocumented drift, debug code, or test weakening found in changed files."
    };
  }
  return {
    id: "no-undocumented-changes",
    label: "No half-finished step is left undocumented",
    status: hasBlockingProblem ? "fail" : "warn",
    detail: problems.join("; ")
  };
}
function runExit(targetDir, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const eventLog = new EventLog(paths.hxDir);
  const cleanupFindings = scanCleanup(paths.root);
  const cleanupOk = isClean(cleanupFindings);
  let featureListOk = true;
  let featureDoc = null;
  if (fs28.existsSync(paths.featureListPath)) {
    featureDoc = loadFeatureList(paths.featureListPath);
    featureListOk = featureDoc.features.every((f) => f.status !== "passing" || f.evidence.length > 0);
  }
  let progressUpdated = fs28.existsSync(paths.progressPath);
  if (progressUpdated) {
    const stat = fs28.statSync(paths.progressPath);
    progressUpdated = Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1e3;
  }
  const changedFilesRaw = getChangedFiles(paths.root);
  const dirty = changedFilesRaw.length > 0;
  const changedFiles = changedFilesRaw.filter((f) => !isHarnessBookkeepingFile(paths.root, f));
  const startupItem = checkStartupPath(paths);
  const verificationItem = checkVerificationPath(paths, eventLog);
  const progressItem = {
    id: "progress-recorded",
    label: "Current progress is recorded in the progress log",
    status: !dirty || progressUpdated ? "pass" : "fail",
    detail: !dirty ? "Working tree is clean \u2014 nothing to record." : progressUpdated ? "Progress log updated recently." : "Progress log is stale or missing. Run hx handoff (or let the Stop hook self-heal it)."
  };
  const active = featureDoc ? activeFeature(featureDoc) : void 0;
  const vcr = featureDoc ? vcrStatus(featureDoc) : null;
  const handoffHasNextStepEarly = handoffHasNextStep(paths.handoffPath);
  const activeFeatureNeedsNextStep = !!active && !handoffHasNextStepEarly;
  const featureStateOk = featureListOk && !activeFeatureNeedsNextStep;
  const featureStateItem = {
    id: "feature-state-truthful",
    label: "Feature state reflects what is actually passing versus unverified",
    status: featureStateOk ? "pass" : "fail",
    detail: [
      featureListOk ? "No feature marked passing without recorded evidence." : "One or more features are marked passing with no evidence recorded.",
      activeFeatureNeedsNextStep ? `Feature "${active.id}" is in_progress but the handoff records no Next Best Step \u2014 a resumed session cannot tell what's left.` : null,
      vcr && vcr.blockedIds.length > 0 ? `Verified Completion Rate: ${(vcr.vcr * 100).toFixed(0)}% (blocked: ${vcr.blockedIds.join(", ")}).` : null
    ].filter(Boolean).join(" ")
  };
  const undocumentedItem = checkNoUndocumentedChanges(paths, changedFiles, cleanupFindings);
  const priorStarts = eventLog.readByType("start");
  const lastStart = priorStarts[priorStarts.length - 1];
  const allHookErrors = eventLog.readByType("hook.error");
  const sessionHandoffs = opts.sessionId ? eventLog.readByType("handoff").filter((e) => e.sessionId === opts.sessionId) : [];
  const windowStartTs = opts.sessionId && sessionHandoffs.length > 0 ? sessionHandoffs[0].ts : lastStart?.ts;
  const hookErrorsThisSession = allHookErrors.filter((e) => !windowStartTs || e.ts > windowStartTs);
  const nextSessionOk = startupItem.status !== "fail" && hookErrorsThisSession.length === 0 && !activeFeatureNeedsNextStep;
  const nextSessionItem = {
    id: "next-session-continues",
    label: "The next session can continue without manual repair",
    status: nextSessionOk ? "pass" : "fail",
    detail: nextSessionOk ? "Startup path works, no hook errors this session, and no in-progress feature is missing a Next Best Step." : [
      startupItem.status === "fail" ? "startup path is broken" : null,
      hookErrorsThisSession.length > 0 ? `${hookErrorsThisSession.length} hook error(s) this session` : null,
      activeFeatureNeedsNextStep ? "no Next Best Step recorded for the in-progress feature" : null
    ].filter(Boolean).join("; ")
  };
  const checklist = [
    startupItem,
    verificationItem,
    progressItem,
    featureStateItem,
    undocumentedItem,
    nextSessionItem
  ];
  const overallOk = checklist.every((c) => c.status !== "fail");
  eventLog.append("exit", {
    cleanupOk,
    featureListOk,
    progressUpdated,
    dirty,
    overallOk,
    checklist: checklist.map((c) => ({ id: c.id, status: c.status }))
  });
  for (const c of checklist) {
    eventLog.append("exit.check", { check: c.id, ok: c.status !== "fail", status: c.status, detail: c.detail });
  }
  const advisories = [];
  if (isAdvancedPack(paths.root)) {
    advisories.push(...planStopAdvisories(paths, dirty));
    const decisionAdvisory = decisionStopAdvisory(paths, changedFilesRaw);
    if (decisionAdvisory) advisories.push(decisionAdvisory);
  }
  return { cleanupFindings, cleanupOk, featureListOk, progressUpdated, dirty, checklist, overallOk, advisories };
}
function formatExitReport(r) {
  const lines = [];
  for (const c of r.checklist) {
    const mark = c.status === "pass" ? "PASS" : c.status === "warn" ? "WARN" : "FAIL";
    lines.push(`[${mark}] ${c.label}`);
    lines.push(`  ${c.detail.split("\n").join("\n  ")}`);
  }
  lines.push("");
  const critical = r.cleanupFindings.filter((f) => f.severity === "critical" && f.found.length > 0);
  if (critical.length > 0) {
    lines.push("Critical cleanup findings:");
    for (const f of critical) lines.push(`  - ${f.check}: ${f.found.join(", ")}`);
  }
  lines.push(r.overallOk ? "CLEAN STATE: PASS" : "CLEAN STATE: FAIL");
  if (r.advisories.length > 0) {
    lines.push("", "Advanced-pack advisories (do not block):");
    for (const a of r.advisories) lines.push(`  - ${a}`);
  }
  return lines.join("\n");
}

// src/kit/handoff.ts
var fs30 = __toESM(require("node:fs"), 1);
var path30 = __toESM(require("node:path"), 1);
var import_node_child_process12 = require("node:child_process");

// src/core/approvals.ts
var fs29 = __toESM(require("node:fs"), 1);
var path29 = __toESM(require("node:path"), 1);
function approvalsDir(root) {
  return path29.join(root, ".claude", "approvals");
}
function listPendingApprovals(root) {
  let entries;
  try {
    entries = fs29.readdirSync(approvalsDir(root), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && e.name !== "README.md" && !e.name.endsWith(".APPLY.md")).map((e) => e.name).sort();
}
function approvalApplyNote(root, approvalFile) {
  const base = approvalFile.replace(/\.[^./\\]+$/, "");
  const applyName = `${base}.APPLY.md`;
  return fs29.existsSync(path29.join(approvalsDir(root), applyName)) ? applyName : null;
}

// src/kit/handoff.ts
function currentCommit2(cwd) {
  try {
    return (0, import_node_child_process12.execFileSync)("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "(no commits)";
  }
}
function nextBestStepFields(doc, next, active) {
  if (!next) {
    return {
      why: active ? `feature "${active.id}" is already active (WIP=1) \u2014 finish or block it first` : "(no unstarted feature found)",
      passing: "(n/a)",
      mustNotChange: "(n/a)"
    };
  }
  const why = next.dependsOn.length > 0 ? `dependencies (${next.dependsOn.join(", ")}) are all passing, and it is the highest-priority (p${next.priority}) not_started feature left` : `highest priority (p${next.priority}) among not_started features with no unmet dependencies`;
  const passing = next.verification.length > 0 ? next.verification.map((v) => "cmd" in v && v.cmd ? v.cmd : "manual" in v && v.manual ? v.manual.join("; ") : "").filter(Boolean).join(" && ") : `hx verify ${next.id} (no verification commands declared yet \u2014 add some before starting)`;
  const otherScopes = doc ? [...new Set(doc.features.filter((f) => f.id !== next.id).flatMap((f) => f.scope))] : [];
  const mustNotChange = (next.scope.length > 0 ? `stay within ${next.scope.join(", ")}` : "no scope declared \u2014 stay narrowly focused") + (otherScopes.length > 0 ? `; avoid ${otherScopes.join(", ")} (belongs to other features)` : "");
  return { why, passing, mustNotChange };
}
function nextSessionNumber(progressContent) {
  const matches = [...progressContent.matchAll(/^### Session (\d+)/gm)];
  if (matches.length === 0) return 1;
  return Math.max(...matches.map((m) => parseInt(m[1], 10))) + 1;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractExistingSessionBlock(progressContent, sessionId) {
  const marker = escapeRegExp(sessionIdMarker(sessionId));
  const re = new RegExp(`\\n### Session (\\d+)\\n\\n${marker}\\n[\\s\\S]*?(?=\\n### Session \\d+|$)`);
  const m = progressContent.match(re);
  if (!m || m.index === void 0) return null;
  const sessionNum = parseInt(m[1], 10);
  const content = progressContent.slice(0, m.index) + progressContent.slice(m.index + m[0].length);
  return { content, sessionNum };
}
function sessionIdMarker(sessionId) {
  return `<!-- hx-session: ${sessionId} -->`;
}
function waitingOnHumanLines(blocked, root) {
  const humanBlockedLines = blocked.filter((f) => f.blockedBy === "human").map((f) => `- ${f.id}: ${f.blockedReason ?? "no reason recorded"}`);
  const approvalLines = listPendingApprovals(root).map((file) => {
    const applyNote = approvalApplyNote(root, file);
    return `- approval: ${file} (see .claude/approvals/README.md)${applyNote ? ` (apply note: ${applyNote})` : ""}`;
  });
  const lines = [...humanBlockedLines, ...approvalLines];
  return lines.length > 0 ? lines : ["- none"];
}
function runHandoff(targetDir, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const doc = fs30.existsSync(paths.featureListPath) ? loadFeatureList(paths.featureListPath) : null;
  const active = doc ? activeFeature(doc) : void 0;
  const next = doc ? pickNext(doc) : void 0;
  const nextBestStep = nextBestStepFields(doc, next, active);
  const passing = doc ? doc.features.filter((f) => f.status === "passing") : [];
  const blocked = doc ? doc.features.filter((f) => f.status === "blocked") : [];
  const commit = currentCommit2(paths.root);
  const changedFiles = getChangedFiles(paths.root).filter((f) => !isHarnessBookkeepingFile(paths.root, f));
  const eventLog = new EventLog(paths.hxDir);
  const recentEvents = eventLog.readLast(40);
  const verifyEvents = recentEvents.filter((e) => e.type === "verify" || e.type === "issue.verify");
  const failedVerifies = verifyEvents.filter((e) => e.allPassed === false);
  fs30.mkdirSync(path30.dirname(paths.progressPath), { recursive: true });
  fs30.mkdirSync(path30.dirname(paths.handoffPath), { recursive: true });
  let progressContent = fs30.existsSync(paths.progressPath) ? fs30.readFileSync(paths.progressPath, "utf-8").replace(/\r\n/g, "\n") : readTemplate("claude-progress.md");
  let sessionNum;
  if (opts.sessionId) {
    const existing = extractExistingSessionBlock(progressContent, opts.sessionId);
    if (existing) {
      progressContent = existing.content;
      sessionNum = existing.sessionNum;
    } else {
      sessionNum = nextSessionNumber(progressContent);
    }
  } else {
    sessionNum = nextSessionNumber(progressContent);
  }
  const entry = [
    "",
    `### Session ${String(sessionNum).padStart(3, "0")}`,
    "",
    ...opts.sessionId ? [sessionIdMarker(opts.sessionId), ""] : [],
    `- Date: ${todayISO()}`,
    `- Active feature: ${active ? active.id : "(none)"}`,
    `- Passing features: ${passing.length}`,
    `- Blocked features: ${blocked.map((f) => f.id).join(", ") || "none"}`,
    `- Verification runs this session: ${verifyEvents.length}`,
    `- Commit: ${commit}`,
    `- Next best step: ${next ? `${next.id} \u2014 ${next.title}` : active ? `finish ${active.id}` : "(none \u2014 check feature_list.json)"}`,
    ""
  ].join("\n");
  progressContent = progressContent.replace(
    /- Current highest-priority unfinished feature:.*/,
    `- Current highest-priority unfinished feature: ${next ? next.id : active ? active.id : "(none)"}`
  );
  progressContent = progressContent.replace(
    /- Current blocker:.*/,
    `- Current blocker: ${blocked.length > 0 ? blocked.map((f) => f.id).join(", ") : "none"}`
  );
  progressContent = progressContent.trimEnd() + "\n" + entry;
  fs30.writeFileSync(paths.progressPath, progressContent, "utf-8");
  const handoffContent = [
    "# Session Handoff",
    "",
    "<!-- Regenerated by `hx handoff` \u2014 hand-edit only between runs if needed. -->",
    "",
    "## Verified Now",
    "",
    `- Passing features: ${passing.map((f) => f.id).join(", ") || "(none)"}`,
    `- Verification runs this session: ${verifyEvents.length}`,
    "",
    "## Changed This Session",
    "",
    `- Commit: ${commit}`,
    `- Files changed: ${changedFiles.length > 0 ? changedFiles.join(", ") : "(none)"}`,
    "",
    "## Broken Or Unverified",
    "",
    `- Blocked: ${blocked.map((f) => `${f.id} (${f.blockedReason ?? "no reason recorded"})`).join(", ") || "none"}`,
    // The actual failure, carried forward. A handoff that says "3 verification runs" and stops is
    // no use to the next session; the command and its exit code are the part worth resuming from.
    ...failedVerifies.length > 0 ? [
      "",
      "### Verification failures this session",
      "",
      ...failedVerifies.map(
        (e) => `- \`${e.failedCmd ?? "(command not recorded)"}\` exited ${e.exitCode ?? "?"}` + (e.id ? ` (${e.id})` : "") + (e.outputTail ? `

  \`\`\`
${String(e.outputTail).split("\n").map((l) => `  ${l}`).join("\n")}
  \`\`\`` : "")
      )
    ] : [],
    "",
    "## Waiting on a human",
    "",
    ...waitingOnHumanLines(blocked, paths.root),
    "",
    "## Next Best Step",
    "",
    // Falls back to the active (in_progress) feature when there is no not_started one to pick —
    // previously this said "(none)" here while the "Why it is next" bullet right below correctly
    // said the active feature should be finished first, a real inconsistency: an in-progress
    // feature IS unfinished work, and a resumed session needs its id, not a claim there is none.
    `- Highest-priority unfinished feature: ${next ? next.id : active ? active.id : "(none)"}`,
    `- Why it is next: ${nextBestStep.why}`,
    `- What counts as passing: ${nextBestStep.passing}`,
    `- What must not change: ${nextBestStep.mustNotChange}`,
    "",
    "## Commands",
    "",
    "- Startup: `hx start`",
    `- Verification: \`hx verify ${next ? next.id : active ? active.id : "<feature-id>"}\``,
    "- Focused debug: `hx logs diagnose`",
    ""
  ].join("\n");
  fs30.writeFileSync(paths.handoffPath, handoffContent, "utf-8");
  eventLog.append("handoff", { sessionNum, commit, sessionId: opts.sessionId });
  return { progressPath: paths.progressPath, handoffPath: paths.handoffPath };
}

// src/kit/rule.ts
var path31 = __toESM(require("node:path"), 1);
function cmdRuleAdd(targetDir, id, description, addedFrom, opts = {}) {
  const resolved = path31.resolve(targetDir);
  addRule(hxDirFor(resolved), id, description, addedFrom, opts);
  new EventLog(hxDirFor(resolved)).append("rule.add", { id, description, addedFrom, check: opts.check });
}
function cmdRuleCheck(targetDir) {
  return runAllRules(path31.resolve(targetDir));
}
function cmdRuleList(targetDir) {
  return loadRulesFile(hxDirFor(path31.resolve(targetDir))).rules;
}
function formatViolations(violations) {
  if (violations.length === 0) return "No rule violations found.";
  const lines = [];
  for (const v of violations) {
    lines.push(`[${v.ruleId}] ${v.file}${v.line ? `:${v.line}` : ""}`);
    lines.push(`  ERROR: ${v.error}`);
    lines.push(`  WHY:   ${v.why}`);
    lines.push(`  FIX:   ${v.fix}`);
  }
  return lines.join("\n");
}
function describeCheck(check) {
  const type = check.type ?? "text";
  if (type === "forbid-import") return `auto-checked (forbid-import: "${check.import}" from files matching "${check.from}")`;
  if (type === "layer-order") return "auto-checked (layer-order \u2014 enforced project-wide via architecture.layers in .claude/hx.config.json)";
  return `auto-checked (${check.mode}: ${check.pattern} in ${check.glob})`;
}
function formatRuleList(rules) {
  if (rules.length === 0) return "No rules registered.";
  const lines = [];
  for (const r of rules) {
    const status = r.check ? describeCheck(r.check) : "manual \u2014 not auto-checked";
    lines.push(`[${r.id}] ${r.description}`);
    lines.push(`  ${status}${r.addedFrom ? ` \u2014 added from: ${r.addedFrom}` : ""}`);
  }
  return lines.join("\n");
}

// src/core/claims.ts
function parseMakerReport(report) {
  const claims2 = [];
  const buildMatch = report.match(/Build:\s*(pass|fail)/i);
  if (buildMatch) claims2.push({ description: "Build", claimed: buildMatch[1].toLowerCase() === "pass" });
  const lintMatch = report.match(/Lint:\s*(pass|fail)/i);
  if (lintMatch) claims2.push({ description: "Lint", claimed: lintMatch[1].toLowerCase() === "pass" });
  const testsMatch = report.match(/Unit tests:\s*(\d+)\s*passed,\s*(\d+)\s*failed/i);
  if (testsMatch) claims2.push({ description: "Unit tests", claimed: parseInt(testsMatch[2], 10) === 0 });
  return claims2;
}
function parseModifiedFiles(report) {
  const m = report.match(/## Modified Files\s*\n([\s\S]*?)(?:\n##|$)/);
  if (!m) return [];
  return m[1].split("\n").map((l) => l.replace(/^[-*]\s*/, "").replace(/`/g, "").trim()).filter(Boolean);
}
function reconcileAgainstOutcome(claims2, actualPassed) {
  const checks = claims2.map((c) => ({
    description: c.description,
    claimed: c.claimed,
    actual: actualPassed,
    isGap: c.claimed && !actualPassed
  }));
  const gaps = checks.filter((c) => c.isGap);
  return { checks, gaps, falseVictory: gaps.length > 0 };
}
function formatReconciliation(result) {
  const lines = [];
  for (const c of result.checks) {
    const marker = c.isGap ? ">>" : "  ";
    lines.push(`${marker}${c.description}: claimed=${c.claimed ? "pass" : "fail"} actual=${c.actual ? "pass" : "fail"}`);
  }
  lines.push(
    result.falseVictory ? `FALSE VICTORY: ${result.gaps.length} claim(s) do not match actual verification.` : "Claims match actual verification."
  );
  return lines.join("\n");
}

// src/kit/claims.ts
var fs31 = __toESM(require("node:fs"), 1);
function cmdClaimsCheck(targetDir, reportPath) {
  const report = fs31.readFileSync(reportPath, "utf-8");
  const claims2 = parseMakerReport(report);
  const paths = resolveProjectPaths(targetDir);
  const events = new EventLog(paths.hxDir).readAll();
  const lastVerify = [...events].reverse().find((e) => e.type === "verify" || e.type === "issue.verify");
  const actualPassed = lastVerify ? lastVerify.allPassed === true : false;
  return reconcileAgainstOutcome(claims2, actualPassed);
}

// src/core/logger.ts
var LATENCY_SPIKE_MS = 1e3;
function diagnose(entries) {
  const errors = entries.filter((e) => e.level === "error").map((e) => ({ component: e.component, action: e.action, error: e.error ?? "unknown" }));
  const latencySpikes = entries.filter((e) => (e.durationMs ?? 0) > LATENCY_SPIKE_MS).map((e) => ({ component: e.component, action: e.action, durationMs: e.durationMs }));
  const emptyOutputCascades = entries.filter((e) => {
    const out = e.output;
    return !!out && typeof out === "object" && "results" in out && out.results === 0;
  }).map((e) => ({ component: e.component, action: e.action }));
  return { errors, latencySpikes, emptyOutputCascades };
}
function formatDiagnosis(d) {
  const lines = [];
  if (d.errors.length > 0) {
    lines.push("ERRORS:");
    for (const e of d.errors) lines.push(`  - ${e.component}.${e.action}: ${e.error}`);
  }
  if (d.latencySpikes.length > 0) {
    lines.push("LATENCY SPIKES:");
    for (const s of d.latencySpikes) lines.push(`  - ${s.component}.${s.action}: ${s.durationMs}ms`);
  }
  if (d.emptyOutputCascades.length > 0) {
    lines.push("EMPTY OUTPUT CASCADES:");
    for (const c of d.emptyOutputCascades) lines.push(`  - ${c.component}.${c.action}: returned 0 results`);
  }
  if (lines.length === 0) lines.push("No issues found in structured logs.");
  return lines.join("\n");
}

// src/loop/controller.ts
var fs33 = __toESM(require("node:fs"), 1);
var path32 = __toESM(require("node:path"), 1);
var import_node_child_process13 = require("node:child_process");
var crypto4 = __toESM(require("node:crypto"), 1);

// src/loop/goal-parser.ts
var fs32 = __toESM(require("node:fs"), 1);
function parseGoalFile(filePath) {
  const content = fs32.readFileSync(filePath, "utf-8");
  return parseGoal(content);
}
function parseGoal(content) {
  const goalMatch = content.match(/^# Goal\s*\n+(?:<!--.*-->\s*\n+)?(.+)$/m);
  const goal = goalMatch ? goalMatch[1].trim() : "(no goal statement found)";
  const acceptanceCommands = [...content.matchAll(/- \[ \] `([^`]+)`/g)].map((m) => m[1]);
  const maxRoundsMatch = content.match(/max (?:turns|rounds)(?: reached)?:\s*`?(\d+)`?/i);
  const maxRounds = maxRoundsMatch ? parseInt(maxRoundsMatch[1], 10) : 20;
  const stallMatch = content.match(/no progress for (\d+) consecutive rounds/i);
  const stallRounds = stallMatch ? parseInt(stallMatch[1], 10) : 3;
  const fairGameSection = content.match(/### Fair game\s*\n+([\s\S]*?)(?=\n###|\n##|$)/);
  const scopeFairGame = fairGameSection ? [...fairGameSection[1].matchAll(/^- (.+)$/gm)].map((m) => m[1].trim()).filter((s) => !s.startsWith("{{")) : [];
  const handsOffSection = content.match(/### Hands off\s*\n+([\s\S]*?)(?=\n###|\n##|$)/);
  const scopeHandsOff = handsOffSection ? [...handsOffSection[1].matchAll(/^- (.+)$/gm)].map((m) => m[1].trim()).filter((s) => !s.startsWith("{{")) : [];
  return { goal, acceptanceCommands, maxRounds, stallRounds, scopeFairGame, scopeHandsOff };
}

// src/agents/adapter.ts
var FakeAdapter = class {
  constructor(script) {
    this.script = script;
  }
  name = "fake";
  callIndex = 0;
  async run(input) {
    const text = this.script(input, this.callIndex);
    this.callIndex++;
    return { text };
  }
};
function resolveAdapter(name, script) {
  if (name === "fake") {
    return new FakeAdapter(script ?? defaultFakeScript);
  }
  if (name === "claude") {
    throw new Error(
      `Claude adapter not wired in this environment \u2014 only the fake adapter ships. See README.md's "The loop and graph runner" section for how to add one (a minimal fetch-only client using ANTHROPIC_API_KEY, or the full SDK in src/agents/claude-adapter.ts).`
    );
  }
  throw new Error(`Unknown adapter: ${name}`);
}
function defaultFakeScript(input) {
  if (input.role === "checker") {
    return "## Overall Verdict\npass\n\n## Issues Found\n(none)\n";
  }
  if (input.role === "planner") {
    return "## Plan\n\n1. (fake planner produced no real plan)\n\n## Assumptions\n(none)\n\n## Open Risks\n(none)\n";
  }
  if (input.role === "verify") {
    return "REVIEW: pass\n";
  }
  if (input.role === "research") {
    return "requirements: (fake research found nothing to change)";
  }
  return "## Implementation Summary\n(fake maker did nothing)\n\n## Basic Verification\n- Build: pass\n- Lint: pass\n- Unit tests: 0 passed, 0 failed\n";
}

// src/loop/controller.ts
var ACCEPTANCE_TIMEOUT_MS = 6e5;
function runAcceptanceCommands(commands, cwd) {
  return commands.map((cmd) => {
    let exitCode = 0;
    let output = "";
    try {
      output = (0, import_node_child_process13.execSync)(cmd, {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: ACCEPTANCE_TIMEOUT_MS,
        killSignal: "SIGKILL"
      });
    } catch (err) {
      if (err?.code === "ETIMEDOUT" || err?.signal === "SIGTERM") {
        exitCode = 124;
        output = `TIMEOUT after ${ACCEPTANCE_TIMEOUT_MS}ms \u2014 the command did not exit on its own.
` + ((err.stdout ?? "") + (err.stderr ?? ""));
      } else {
        exitCode = typeof err.status === "number" ? err.status : 1;
        output = (err.stdout ?? "") + (err.stderr ?? "");
      }
    }
    return { cmd, passed: exitCode === 0, exitCode, output: output.slice(0, 1e3) };
  });
}
function errorSignature(acceptance) {
  const failing = acceptance.filter((a) => !a.passed).map((a) => `${a.cmd}:${a.exitCode}`);
  if (failing.length === 0) return "";
  return crypto4.createHash("sha1").update(failing.sort().join("|")).digest("hex").slice(0, 12);
}
var CHECKER_DIFF_CAP_BYTES = 2e4;
function gitDiffTextForChecker(repoRoot) {
  try {
    const out = (0, import_node_child_process13.execSync)("git diff HEAD", { cwd: repoRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 15e3 });
    if (!out.trim()) return "";
    return out.length > CHECKER_DIFF_CAP_BYTES ? out.slice(0, CHECKER_DIFF_CAP_BYTES) + `
... (diff truncated at ${CHECKER_DIFF_CAP_BYTES} bytes; ${out.length} total)` : out;
  } catch {
    return "";
  }
}
function readEvaluatorRubric(repoRoot) {
  const projectPath = path32.join(repoRoot, "evaluator-rubric.md");
  try {
    return fs33.readFileSync(projectPath, "utf-8");
  } catch {
    try {
      return readTemplate("evaluator-rubric.md");
    } catch {
      return "";
    }
  }
}
function parseCheckerVerdict(text) {
  const m = text.match(/## Overall Verdict\s*\n+\s*([a-zA-Z-]+)/);
  const raw = m ? m[1].toLowerCase() : "";
  if (raw === "pass") return "pass";
  if (raw === "minor-issues-acceptable") return "minor-issues-acceptable";
  return "fail";
}
function detectBlocker(makerReport) {
  return /\bBLOCKER\b/i.test(makerReport);
}
function parseRubricScores(checkerText) {
  const start = checkerText.indexOf("## Rubric");
  if (start === -1) return [];
  const nextHeading = checkerText.indexOf("\n## ", start + 1);
  const section = checkerText.slice(start, nextHeading === -1 ? checkerText.length : nextHeading);
  const scores = [];
  for (const line of section.split("\n")) {
    const cells = line.match(/^\|(.+)\|\s*$/)?.[1]?.split("|").map((c) => c.trim());
    if (!cells || cells.length < 3) continue;
    const [category, , scoreCell] = cells;
    if (!category || /^-+$/.test(category) || category.toLowerCase() === "category") continue;
    if (!scoreCell || !/^\d+$/.test(scoreCell)) continue;
    scores.push({ category, score: parseInt(scoreCell, 10) });
  }
  return scores;
}
function formatRubricScoresAsScoreFlags(scores) {
  return scores.map((s) => `--score ${s.category.toLowerCase().replace(/\s+/g, "-")}=${s.score}`).join(" ");
}
function writeLoopState(hxDir, goal, rounds, status, planText = "") {
  const lines = [];
  lines.push("# Loop State");
  lines.push("");
  lines.push(`## Basic Info`);
  lines.push(`- Current round: ${rounds.length} / ${goal.maxRounds}`);
  lines.push(`- Current status: ${status}`);
  lines.push("");
  lines.push(`## Goal`);
  lines.push("");
  lines.push(goal.goal);
  lines.push("");
  if (planText) {
    lines.push(`## Plan (from the Planner role)`);
    lines.push("");
    lines.push(planText);
    lines.push("");
  }
  lines.push(`## Round Log`);
  for (const r of rounds) {
    lines.push("");
    lines.push(`### Round ${r.round}`);
    lines.push(`- Acceptance: ${r.acceptance.filter((a) => a.passed).length}/${r.acceptance.length} passed`);
    lines.push(`- Checker verdict: ${r.checkerVerdict}`);
    lines.push(`- Human intervention needed: ${r.blocker ? "yes" : "no"}`);
    lines.push(`- Files changed: ${r.changedFiles.length}${r.changedFiles.length > 0 ? ` (${r.changedFiles.join(", ")})` : ""}`);
    if (r.falseVictory) lines.push(`- FALSE VICTORY: claimed pass on ${r.claimGaps.join(", ")}`);
    if (r.undeclaredFiles.length > 0) lines.push(`- Undeclared file changes: ${r.undeclaredFiles.join(", ")}`);
    if (r.rubricScores.length > 0) {
      lines.push(`- Rubric scores: ${r.rubricScores.map((s) => `${s.category}=${s.score}`).join(", ")}`);
    }
  }
  lines.push("");
  lines.push(`## Blocker List`);
  lines.push("");
  const blockerRounds = rounds.filter((r) => r.blocker);
  if (blockerRounds.length === 0) {
    lines.push("(none)");
  } else {
    for (const r of blockerRounds) lines.push(`- Round ${r.round}: human intervention requested`);
  }
  lines.push("");
  lines.push(`## Cumulative Stats`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Rounds completed | ${rounds.length} |`);
  lines.push(`| Passed rounds | ${rounds.filter((r) => r.checkerVerdict !== "fail" && r.allAcceptancePassed).length} |`);
  lines.push(`| Failed rounds | ${rounds.filter((r) => r.checkerVerdict === "fail" || !r.allAcceptancePassed).length} |`);
  lines.push(`| Human interventions | ${blockerRounds.length} |`);
  lines.push(`| Files changed (total, across all rounds) | ${new Set(rounds.flatMap((r) => r.changedFiles)).size} |`);
  const llmCalls = new EventLog(hxDir).readByType("llm.call");
  const totalInputTokens = llmCalls.reduce((sum, e) => sum + (Number(e.inputTokens) || 0), 0);
  const totalOutputTokens = llmCalls.reduce((sum, e) => sum + (Number(e.outputTokens) || 0), 0);
  if (llmCalls.length > 0) {
    lines.push(`| LLM calls with recorded usage | ${llmCalls.length} |`);
    lines.push(`| Total input tokens | ${totalInputTokens} |`);
    lines.push(`| Total output tokens | ${totalOutputTokens} |`);
  }
  lines.push("");
  lines.push(`## Final Result`);
  lines.push("");
  if (status === "in-progress") {
    lines.push("(loop still running)");
  } else {
    const last = rounds[rounds.length - 1];
    lines.push(`- Final status: ${status}`);
    lines.push(`- Finished at: ${(/* @__PURE__ */ new Date()).toISOString()}`);
    lines.push(
      `- Summary: ${rounds.length} round(s) run; last checker verdict was "${last?.checkerVerdict ?? "(none)"}"${blockerRounds.length > 0 ? `; ${blockerRounds.length} round(s) requested human intervention` : ""}.`
    );
  }
  fs33.mkdirSync(hxDir, { recursive: true });
  fs33.writeFileSync(path32.join(hxDir, "loop-state.md"), lines.join("\n") + "\n", "utf-8");
}
async function runGoalLoop(opts) {
  const goal = parseGoalFile(opts.goalFile);
  if (opts.maxRoundsOverride) goal.maxRounds = opts.maxRoundsOverride;
  const adapter = resolveAdapter(opts.adapterName, opts.fakeScript);
  const makerPrompt = readTemplate("maker-prompt.md");
  const checkerPrompt = readTemplate("checker-prompt.md");
  const hxDir = hxDirFor(opts.repoRoot);
  const eventLog = new EventLog(hxDir);
  const rubricText = readEvaluatorRubric(opts.repoRoot);
  const rounds = [];
  let consecutiveStallCount = 0;
  let lastSignature = "";
  let status = null;
  function recordUsage(role, output) {
    if (output.usage) {
      eventLog.append("llm.call", { role, inputTokens: output.usage.inputTokens, outputTokens: output.usage.outputTokens });
    }
  }
  let planText = "";
  if (opts.planner) {
    const plannerPrompt = readTemplate("planner-prompt.md");
    const plannerOut = await adapter.run({
      role: "planner",
      system: plannerPrompt,
      prompt: `${goal.goal}

Acceptance criteria:
${goal.acceptanceCommands.map((c) => `- ${c}`).join("\n")}`,
      cwd: opts.repoRoot
    });
    recordUsage("planner", plannerOut);
    planText = plannerOut.text;
    eventLog.append("loop.plan", { plan: planText });
  }
  for (let roundNum = 1; roundNum <= goal.maxRounds; roundNum++) {
    const makerOut = await adapter.run({
      role: "maker",
      system: makerPrompt,
      prompt: `${goal.goal}

Round ${roundNum}. Prior rounds: ${rounds.length}.${planText ? `

AGREED PLAN (from the Planner role \u2014 follow this):
${planText}` : ""}`,
      cwd: opts.repoRoot
    });
    recordUsage("maker", makerOut);
    const acceptance = runAcceptanceCommands(goal.acceptanceCommands, opts.repoRoot);
    const allAcceptancePassed = acceptance.every((a) => a.passed) && acceptance.length > 0;
    const signature = errorSignature(acceptance);
    const claims2 = parseMakerReport(makerOut.text);
    const claimReconciliation = claims2.length > 0 ? reconcileAgainstOutcome(claims2, allAcceptancePassed) : null;
    const falseVictory = claimReconciliation?.falseVictory ?? false;
    const claimGaps = claimReconciliation?.gaps.map((g) => g.description) ?? [];
    const declaredFiles = parseModifiedFiles(makerOut.text);
    const actualChangedFiles = getChangedFiles(opts.repoRoot);
    const undeclaredFiles = declaredFiles.length > 0 ? actualChangedFiles.filter((f) => !declaredFiles.includes(f)) : [];
    let checkerPromptExtra = "";
    if (falseVictory) {
      checkerPromptExtra += `

FALSE VICTORY: the maker's own report claims success on something the actual command output contradicts:
${formatReconciliation(claimReconciliation)}`;
    }
    if (undeclaredFiles.length > 0) {
      checkerPromptExtra += `

UNDECLARED FILE CHANGES (present in git diff, not listed under "## Modified Files"):
${undeclaredFiles.join("\n")}`;
    }
    const diffText = gitDiffTextForChecker(opts.repoRoot);
    if (diffText) {
      checkerPromptExtra += `

GIT DIFF (git diff HEAD, this round's changes):
${diffText}`;
    }
    if (goal.scopeFairGame.length > 0) {
      const drift = checkDrift(opts.repoRoot, { id: "goal-loop", scope: goal.scopeFairGame });
      checkerPromptExtra += `

SCOPE DRIFT CHECK:
${formatDrift(drift, { id: "goal-loop", scope: goal.scopeFairGame })}`;
    }
    if (rubricText) {
      checkerPromptExtra += `

EVALUATOR RUBRIC (judge against these categories in your verdict):
${rubricText}`;
    }
    const checkerOut = await adapter.run({
      role: "checker",
      system: checkerPrompt,
      prompt: `Acceptance command results:
${acceptance.map((a) => `${a.cmd}: ${a.passed ? "pass" : "fail"} (exit ${a.exitCode})`).join("\n")}${checkerPromptExtra}`,
      cwd: opts.repoRoot
    });
    recordUsage("checker", checkerOut);
    let checkerVerdict = parseCheckerVerdict(checkerOut.text);
    if (falseVictory && checkerVerdict !== "fail") {
      checkerVerdict = "fail";
    }
    const blocker = detectBlocker(makerOut.text);
    const rubricScores = parseRubricScores(checkerOut.text);
    const round = {
      round: roundNum,
      makerReport: makerOut.text,
      acceptance,
      allAcceptancePassed,
      checkerVerdict,
      checkerReport: checkerOut.text,
      errorSignature: signature,
      blocker,
      falseVictory,
      claimGaps,
      undeclaredFiles,
      changedFiles: actualChangedFiles,
      rubricScores
    };
    rounds.push(round);
    eventLog.append("loop.round", { round: roundNum, allAcceptancePassed, checkerVerdict, blocker, falseVictory });
    if (rubricScores.length > 0) {
      eventLog.append("loop.rubric-score", { round: roundNum, scores: rubricScores, asScoreFlags: formatRubricScoresAsScoreFlags(rubricScores) });
    }
    if (falseVictory) {
      eventLog.append("loop.false-victory", { round: roundNum, gaps: claimGaps });
    }
    writeLoopState(hxDir, goal, rounds, "in-progress", planText);
    if (blocker) {
      status = "blocked";
      break;
    }
    if (allAcceptancePassed && checkerVerdict === "pass") {
      status = "goal-met";
      break;
    }
    if (signature && signature === lastSignature) {
      consecutiveStallCount++;
    } else {
      consecutiveStallCount = 0;
    }
    lastSignature = signature;
    if (consecutiveStallCount >= goal.stallRounds - 1) {
      status = "stalled";
      break;
    }
  }
  if (!status) status = "max-rounds";
  writeLoopState(hxDir, goal, rounds, status, planText);
  eventLog.append("loop.finished", { status, rounds: rounds.length });
  return { status, rounds, goal };
}

// src/graph/engine.ts
var import_node_child_process14 = require("node:child_process");
var fs35 = __toESM(require("node:fs"), 1);
var path34 = __toESM(require("node:path"), 1);

// src/graph/checkpoint.ts
var fs34 = __toESM(require("node:fs"), 1);
var path33 = __toESM(require("node:path"), 1);
function checkpointPath(hxDir, threadId) {
  return path33.join(hxDir, "runs", threadId, "checkpoint.json");
}
function saveCheckpoint(hxDir, cp) {
  const p = checkpointPath(hxDir, cp.threadId);
  fs34.mkdirSync(path33.dirname(p), { recursive: true });
  fs34.writeFileSync(p, JSON.stringify(cp, null, 2) + "\n", "utf-8");
}
function loadCheckpoint(hxDir, threadId) {
  const p = checkpointPath(hxDir, threadId);
  if (!fs34.existsSync(p)) return null;
  return JSON.parse(fs34.readFileSync(p, "utf-8"));
}

// src/graph/engine.ts
function loadGraphDef(filePath) {
  return JSON.parse(fs35.readFileSync(filePath, "utf-8"));
}
function applyReducer(current, incoming, reducer) {
  switch (reducer) {
    case "sum":
      return (typeof current === "number" ? current : 0) + (typeof incoming === "number" ? incoming : 0);
    case "append":
      return (Array.isArray(current) ? current : current ? [current] : []).concat(incoming);
    case "overwrite":
    default:
      return incoming;
  }
}
function mergeState(def, state, updates) {
  const next = { ...state };
  for (const [key, value] of Object.entries(updates)) {
    const fieldDef = def.state[key];
    const reducer = fieldDef?.reducer ?? "overwrite";
    next[key] = applyReducer(next[key], value, reducer);
  }
  return next;
}
function initialState(def, entry = {}) {
  const state = {};
  for (const [key, fieldDef] of Object.entries(def.state)) {
    state[key] = fieldDef.initial ?? (fieldDef.reducer === "sum" ? 0 : fieldDef.reducer === "append" ? [] : void 0);
  }
  return { ...state, ...entry };
}
function parseVerifyVerdict(text) {
  const m = text.match(/REVIEW:\s*(pass|fail|needs-info)/i);
  const raw = m ? m[1].toLowerCase() : "";
  if (raw === "pass" || raw === "fail" || raw === "needs-info") return raw;
  return "fail";
}
function parseOrigin(text) {
  const m = text.match(/Origin:\s*(\S+)/i);
  return m ? m[1] : null;
}
var COMMAND_NODE_TIMEOUT_MS = 6e5;
async function runNodeDetailed(node, state, adapter, cwd) {
  if (node.type === "command") {
    if (node.cmd) {
      (0, import_node_child_process14.execSync)(node.cmd, { cwd, stdio: "ignore", timeout: COMMAND_NODE_TIMEOUT_MS, killSignal: "SIGKILL" });
    }
    return { updates: {} };
  }
  if (node.type === "human" || node.type === "parallel") {
    return { updates: {} };
  }
  const nodePromptTemplate = readTemplate("node-prompt.md");
  const prompt = nodePromptTemplate.split("{{NODE_NAME}}").join(node.id).split("{{READS}}").join((node.reads ?? []).map((r) => `- ${r}: ${JSON.stringify(state[r])}`).join("\n") || "(none)").split("{{WRITES}}").join(node.writes.join(", ")).split("{{ROLE_INSTRUCTIONS}}").join(`Act as the "${node.role ?? node.id}" role for this graph.`);
  const output = await adapter.run({ role: node.role ?? node.id, system: prompt, prompt: JSON.stringify(state), cwd });
  if (node.role === "verify") {
    const verdict = parseVerifyVerdict(output.text);
    const origin = verdict === "fail" ? parseOrigin(output.text) : null;
    const updates2 = {};
    if (node.writes[0]) updates2[node.writes[0]] = verdict;
    if (node.writes[1]) updates2[node.writes[1]] = verdict === "fail" ? 1 : 0;
    if (origin) updates2.problemOrigin = origin;
    return { updates: updates2, usage: output.usage };
  }
  const updates = {};
  if (node.writes[0]) updates[node.writes[0]] = output.text;
  return { updates, usage: output.usage };
}
async function runNode(node, state, adapter, cwd) {
  return (await runNodeDetailed(node, state, adapter, cwd)).updates;
}
async function runParallelBranch(branch, nodeDef, def, state, adapter, repoRoot, hxDir, threadId) {
  const branchNodeDef = def.nodes.find((n) => n.id === branch.node);
  if (!branchNodeDef) {
    return { name: branch.name, result: {}, durationMs: 0, tokens: 0, error: `references unknown node "${branch.node}"` };
  }
  let cwd = repoRoot;
  let worktreePath = null;
  if (nodeDef.isolation === "worktree") {
    worktreePath = path34.join(resolveProjectPaths(repoRoot).worktreesDir, `${threadId}-${branch.name}`);
    ensureWorktreesGitignored(repoRoot);
    fs35.mkdirSync(path34.dirname(worktreePath), { recursive: true });
    try {
      (0, import_node_child_process14.execFileSync)("git", ["worktree", "add", worktreePath, "HEAD"], { cwd: repoRoot, stdio: "ignore", timeout: 3e4 });
    } catch (err) {
      return { name: branch.name, result: {}, durationMs: 0, tokens: 0, error: `git worktree add failed: ${err.message}` };
    }
    cwd = worktreePath;
  }
  const start = Date.now();
  try {
    const { updates, usage } = await runNodeDetailed(branchNodeDef, state, adapter, cwd);
    return {
      name: branch.name,
      result: updates,
      durationMs: Date.now() - start,
      tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)
    };
  } catch (err) {
    return { name: branch.name, result: {}, durationMs: Date.now() - start, tokens: 0, error: err.message };
  } finally {
    if (worktreePath) {
      try {
        (0, import_node_child_process14.execFileSync)("git", ["worktree", "remove", worktreePath, "--force"], { cwd: repoRoot, stdio: "ignore", timeout: 3e4 });
      } catch {
      }
    }
  }
}
async function runParallelNode(nodeDef, def, cp, adapter, repoRoot, hxDir) {
  const branches = nodeDef.branches ?? [];
  const outcomes = await Promise.all(branches.map((b) => runParallelBranch(b, nodeDef, def, cp.state, adapter, repoRoot, hxDir, cp.threadId)));
  const branchesState = {};
  for (const o of outcomes) {
    branchesState[o.name] = { result: o.result, durationMs: o.durationMs, tokens: o.tokens, ...o.error ? { error: o.error } : {} };
  }
  const failed = outcomes.filter((o) => o.error);
  const policy = nodeDef.joinPolicy ?? "all";
  if (policy === "all" && failed.length > 0) {
    throw new Error(`Parallel node "${nodeDef.id}" failed (joinPolicy: all): ${failed.map((f) => `${f.name}: ${f.error}`).join("; ")}`);
  }
  if (policy === "any" && failed.length === outcomes.length && outcomes.length > 0) {
    throw new Error(`Parallel node "${nodeDef.id}": every branch failed (joinPolicy: any).`);
  }
  return { branches: branchesState };
}
function writeInterruptNote(hxDir, cp, def, nodeId) {
  const nodeDef = def.nodes.find((n) => n.id === nodeId);
  const approvalField = nodeDef?.writes[0] ?? "approved";
  const approvedEdge = def.routing.find((e) => e.from === nodeId && e.when?.field === approvalField && e.when.equals === true);
  const rejectedEdge = def.routing.find((e) => e.from === nodeId && e.when?.field === approvalField && e.when.equals === false);
  const recentHistory = cp.history.slice(-5);
  const lines = [
    `# Interrupt: ${nodeId}`,
    "",
    "## What happened",
    "",
    recentHistory.length > 0 ? recentHistory.map((h) => `- ${h.node} (${h.at})`).join("\n") : "(no prior steps)",
    "",
    "## What changed",
    "",
    "```json",
    JSON.stringify(cp.state, null, 2),
    "```",
    "",
    "## Why a human",
    "",
    `Node "${nodeId}" is a human-approval gate in this graph` + (nodeDef?.timeoutHours != null ? ` (times out after ${nodeDef.timeoutHours}h, then ${nodeDef.onTimeout ?? "escalate"}).` : "."),
    "",
    "## Consequences",
    "",
    `- Approve: routes to \`${approvedEdge?.to ?? `(no when: {field: "${approvalField}", equals: true} edge declared)`}\``,
    `- Reject: routes to \`${rejectedEdge?.to ?? `(no when: {field: "${approvalField}", equals: false} edge declared)`}\``,
    ""
  ];
  const p = path34.join(hxDir, "runs", cp.threadId, "interrupt.md");
  fs35.mkdirSync(path34.dirname(p), { recursive: true });
  fs35.writeFileSync(p, lines.join("\n"), "utf-8");
}
function route(def, fromNode, state) {
  if (typeof state.problemOrigin === "string" && def.nodes.some((n) => n.id === state.problemOrigin)) {
    return state.problemOrigin;
  }
  const edges = def.routing.filter((e) => e.from === fromNode);
  for (const edge of edges) {
    if (edge.when) {
      if (state[edge.when.field] === edge.when.equals) return edge.to;
    }
  }
  const defaultEdge = edges.find((e) => e.default);
  if (defaultEdge) return defaultEdge.to;
  if (edges.length === 1 && !edges[0].when) return edges[0].to;
  if (edges.length === 0) return null;
  throw new Error(
    `Graph routing is unresolved at node "${fromNode}" with state ${JSON.stringify(state)}. No matching "when" edge and no "default" edge declared \u2014 refusing to guess a path (course-issue #2, fail-closed routing).`
  );
}
async function step(def, cp, adapter, cwd, hxDir) {
  const eventLog = new EventLog(hxDir);
  let node = cp.currentNode;
  if (!node) return cp;
  const nodeDef = def.nodes.find((n) => n.id === node);
  if (!nodeDef) throw new Error(`Unknown node: ${node}`);
  if (nodeDef.type === "human" || (def.approvalBefore ?? []).includes(node)) {
    cp.status = "waiting-approval";
    cp.pendingApprovalNode = node;
    cp.pendingApprovalSince = (/* @__PURE__ */ new Date()).toISOString();
    eventLog.append("graph.waiting-approval", { thread: cp.threadId, node });
    writeInterruptNote(hxDir, cp, def, node);
    saveCheckpoint(hxDir, cp);
    return cp;
  }
  const updates = nodeDef.type === "parallel" ? await runParallelNode(nodeDef, def, cp, adapter, cwd, hxDir) : await runNode(nodeDef, cp.state, adapter, cwd);
  cp.state = mergeState(def, cp.state, updates);
  cp.history.push({ node, at: (/* @__PURE__ */ new Date()).toISOString() });
  eventLog.append("graph.step", { thread: cp.threadId, node, updates });
  let next;
  if (nodeDef.capField && typeof nodeDef.capValue === "number" && cp.state[nodeDef.capField] >= nodeDef.capValue) {
    next = nodeDef.capRoute ?? null;
    eventLog.append("graph.cap-exceeded", { thread: cp.threadId, node, capField: nodeDef.capField, value: cp.state[nodeDef.capField] });
  } else {
    if (typeof cp.state.problemOrigin === "string" && def.nodes.some((n) => n.id === cp.state.problemOrigin)) {
      eventLog.append("graph.rollback-to-origin", { thread: cp.threadId, from: node, to: cp.state.problemOrigin });
    }
    next = route(def, node, cp.state);
  }
  delete cp.state.problemOrigin;
  cp.currentNode = next;
  if (next === null) {
    cp.status = "completed";
  } else {
    const nextDef = def.nodes.find((n) => n.id === next);
    if (nextDef?.type === "human") {
    }
  }
  saveCheckpoint(hxDir, cp);
  return cp;
}
async function driveToCompletion(def, cp, adapter, cwd, hxDir) {
  let current = cp;
  const maxSteps = 100;
  let steps = 0;
  while (current.status === "running" && current.currentNode !== null && steps < maxSteps) {
    current = await step(def, current, adapter, cwd, hxDir);
    steps++;
  }
  if (steps >= maxSteps && current.status === "running") {
    current.status = "error";
    current.error = "Graph exceeded max step circuit breaker (100 steps) without completing or pausing.";
    saveCheckpoint(hxDir, current);
  }
  return current;
}
async function runGraph(def, opts) {
  const hxDir = hxDirFor(opts.repoRoot);
  const adapter = resolveAdapter(opts.adapterName, opts.fakeScript);
  const cp = {
    threadId: opts.threadId,
    graphName: def.name,
    graphFile: opts.graphFile ?? "",
    state: initialState(def, opts.entryState),
    currentNode: def.start,
    status: "running",
    history: []
  };
  saveCheckpoint(hxDir, cp);
  const final = await driveToCompletion(def, cp, adapter, opts.repoRoot, hxDir);
  return { status: final.status, state: final.state, history: final.history };
}
function resolveDef(cp, def) {
  if (def) return def;
  if (!cp.graphFile) throw new Error(`Checkpoint for thread "${cp.threadId}" has no recorded graphFile; pass def explicitly.`);
  return loadGraphDef(cp.graphFile);
}
async function resumeGraph(threadId, opts, defIn) {
  const hxDir = hxDirFor(opts.repoRoot);
  const cp = loadCheckpoint(hxDir, threadId);
  if (!cp) throw new Error(`No checkpoint found for thread "${threadId}"`);
  const def = resolveDef(cp, defIn);
  if (cp.status === "waiting-approval" && cp.pendingApprovalNode && cp.pendingApprovalSince) {
    const nodeDef = def.nodes.find((n) => n.id === cp.pendingApprovalNode);
    if (nodeDef?.timeoutHours != null) {
      const elapsedHours = (Date.now() - new Date(cp.pendingApprovalSince).getTime()) / 36e5;
      if (elapsedHours >= nodeDef.timeoutHours) {
        const eventLog = new EventLog(hxDir);
        if ((nodeDef.onTimeout ?? "escalate") === "reject") {
          eventLog.append("graph.timeout", { thread: threadId, node: cp.pendingApprovalNode, action: "reject", elapsedHours });
          return approveInterrupt(threadId, false, opts, def);
        }
        eventLog.append("graph.timeout", { thread: threadId, node: cp.pendingApprovalNode, action: "escalate", elapsedHours });
        writeInterruptNote(hxDir, cp, def, cp.pendingApprovalNode);
        fs35.appendFileSync(
          path34.join(hxDir, "runs", threadId, "interrupt.md"),
          `
**ESCALATED:** waiting ${elapsedHours.toFixed(1)}h, past the ${nodeDef.timeoutHours}h timeout with no approval recorded.
`,
          "utf-8"
        );
        return { status: cp.status, state: cp.state, history: cp.history };
      }
    }
  }
  const adapter = resolveAdapter(opts.adapterName, opts.fakeScript);
  cp.status = "running";
  const final = await driveToCompletion(def, cp, adapter, opts.repoRoot, hxDir);
  return { status: final.status, state: final.state, history: final.history };
}
async function approveInterrupt(threadId, approved, opts, defIn) {
  const hxDir = hxDirFor(opts.repoRoot);
  const cp = loadCheckpoint(hxDir, threadId);
  if (!cp) throw new Error(`No checkpoint found for thread "${threadId}"`);
  if (cp.status !== "waiting-approval" || !cp.pendingApprovalNode) {
    throw new Error(`Thread "${threadId}" is not waiting for approval (status: ${cp.status}).`);
  }
  const def = resolveDef(cp, defIn);
  cp.state = mergeState(def, cp.state, { approved });
  const eventLog = new EventLog(hxDir);
  eventLog.append("graph.approval", { thread: threadId, node: cp.pendingApprovalNode, approved });
  const humanNode = cp.pendingApprovalNode;
  const next = route(def, humanNode, cp.state);
  cp.currentNode = next;
  cp.status = "running";
  cp.pendingApprovalNode = void 0;
  cp.history.push({ node: humanNode, at: (/* @__PURE__ */ new Date()).toISOString() });
  saveCheckpoint(hxDir, cp);
  const adapter = resolveAdapter(opts.adapterName, opts.fakeScript);
  const final = await driveToCompletion(def, cp, adapter, opts.repoRoot, hxDir);
  return { status: final.status, state: final.state, history: final.history };
}

// src/graph/render.ts
function renderGraphMarkdown(def) {
  const lines = [];
  lines.push(`# ${def.name}`);
  lines.push("");
  lines.push("<!-- Generated by `hx graph render` from the graph JSON definition. Do not hand-edit; -->");
  lines.push("<!-- edit the JSON and re-render, or this file will drift from the executable graph. -->");
  lines.push("");
  lines.push("## Diagram");
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart TD");
  lines.push(`  __start__([Start]) --> ${def.start}`);
  for (const node of def.nodes) {
    const shape = node.type === "human" ? `{{${node.id}}}` : node.type === "command" ? `[/${node.id}/]` : node.type === "parallel" ? `[[${node.id}]]` : `[${node.id}]`;
    lines.push(`  ${node.id}${shape}`);
  }
  for (const edge of def.routing) {
    const label = edge.when ? `${edge.when.field}=${edge.when.equals}` : edge.default ? "default" : "";
    lines.push(`  ${edge.from} -->${label ? `|${label}|` : ""} ${edge.to}`);
  }
  for (const node of def.nodes) {
    const isTerminal = !def.routing.some((e) => e.from === node.id);
    if (isTerminal) lines.push(`  ${node.id} --> __end__([End])`);
  }
  lines.push("```");
  lines.push("");
  lines.push("## Nodes");
  lines.push("");
  lines.push("| Node | Type | Writes | Reads | Notes |");
  lines.push("|---|---|---|---|---|");
  for (const n of def.nodes) {
    const notes = [];
    if (n.capField) notes.push(`caps at ${n.capField} >= ${n.capValue} -> ${n.capRoute}`);
    if (n.cmd) notes.push(`cmd: \`${n.cmd}\``);
    if (n.branches) notes.push(`branches: ${n.branches.map((b) => `${b.name}->${b.node}`).join(", ")} (${n.joinPolicy ?? "all"}, ${n.isolation ?? "none"})`);
    if (n.timeoutHours != null) notes.push(`timeout ${n.timeoutHours}h -> ${n.onTimeout ?? "escalate"}`);
    lines.push(`| ${n.id} | ${n.type} | ${n.writes.join(", ") || "-"} | ${(n.reads ?? []).join(", ") || "-"} | ${notes.join("; ") || "-"} |`);
  }
  lines.push("");
  lines.push("## Shared State");
  lines.push("");
  lines.push("| Field | Reducer | Initial |");
  lines.push("|---|---|---|");
  for (const [field, def2] of Object.entries(def.state)) {
    lines.push(`| ${field} | ${def2.reducer} | ${JSON.stringify(def2.initial ?? null)} |`);
  }
  lines.push("");
  lines.push("## Shared State Reads/Writes");
  lines.push("");
  lines.push("| Field | Written By | Read By |");
  lines.push("|---|---|---|");
  const fieldsInUse = new Set(Object.keys(def.state));
  for (const n of def.nodes) {
    for (const w of n.writes) fieldsInUse.add(w);
    for (const r of n.reads ?? []) fieldsInUse.add(r);
  }
  for (const field of [...fieldsInUse].sort()) {
    const writers = def.nodes.filter((n) => n.writes.includes(field)).map((n) => n.id);
    const readers = def.nodes.filter((n) => (n.reads ?? []).includes(field)).map((n) => n.id);
    lines.push(`| ${field} | ${writers.join(", ") || "-"} | ${readers.join(", ") || "-"} |`);
  }
  lines.push("");
  lines.push("## Routing Rules");
  lines.push("");
  lines.push("| From | Condition | To |");
  lines.push("|---|---|---|");
  for (const e of def.routing) {
    const cond = e.when ? `${e.when.field} == "${e.when.equals}"` : e.default ? "default (no other match)" : "always";
    lines.push(`| ${e.from} | ${cond} | ${e.to} |`);
  }
  lines.push("");
  lines.push(
    "Unmatched state at a node with no `default` edge is a configuration error, not a silent pass (course-issue #2: fail-closed routing)."
  );
  return lines.join("\n") + "\n";
}

// src/learn/index-course.ts
var fs36 = __toESM(require("node:fs"), 1);
var path35 = __toESM(require("node:path"), 1);
var crypto5 = __toESM(require("node:crypto"), 1);
var import_fast_glob = __toESM(require_out4(), 1);
var import_meta2 = {};
function hashCourseDir(courseRoot) {
  const resolved = path35.resolve(courseRoot);
  const files = import_fast_glob.default.sync(["**/*"], { cwd: resolved, onlyFiles: true, dot: false }).sort();
  const hash = crypto5.createHash("sha1");
  for (const relFile of files) {
    try {
      const stat = fs36.statSync(path35.join(resolved, relFile));
      hash.update(`${relFile}:${stat.size}:${stat.mtimeMs}
`);
    } catch {
      hash.update(`${relFile}:MISSING
`);
    }
  }
  return hash.digest("hex");
}
var SKIP_FILES = /* @__PURE__ */ new Set(["ALL-IN-ONE-complete-course.md", "README.md"]);
var INDEXABLE_EXT = [".md", ".ts", ".py", ".json", ".sh", ".txt"];
var SKIP_HEADINGS = /* @__PURE__ */ new Set(["Companion code pack"]);
function isBreadcrumbPreamble(text) {
  return text.startsWith("> **") && text.includes("Source: `docs/en");
}
var CLAIM_HINTS = [
  /\b\d{1,3}%\b/,
  // any percentage
  /\$\d+(\.\d+)?/,
  // dollar costs
  /\b\d+x\b/i
  // "3x efficiency"
];
function defaultCourseRoot() {
  const here = moduleDir(import_meta2.url);
  return path35.resolve(here, "..", "..", "..", "learn-harness-engineering-en");
}
function chunkMarkdown(content, file) {
  const lines = content.split("\n");
  const chunks = [];
  let currentHeading = "(preamble)";
  let currentLines = [];
  let chunkIndex = 0;
  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text.length > 0 && !SKIP_HEADINGS.has(currentHeading)) {
      chunks.push({
        id: `${file}#${chunkIndex++}`,
        file,
        heading: currentHeading,
        text,
        issueTags: CLAIM_HINTS.some((re) => re.test(text)) ? ["course-claim"] : []
      });
    }
    currentLines = [];
  };
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      currentHeading = line.replace(/^#+\s+/, "").trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();
  if (chunks.length > 1) {
    return chunks.filter((c) => !(c.heading === "(preamble)" && isBreadcrumbPreamble(c.text)));
  }
  return chunks;
}
function chunkWhole(content, file) {
  return [
    {
      id: `${file}#0`,
      file,
      heading: path35.basename(file),
      text: content,
      issueTags: CLAIM_HINTS.some((re) => re.test(content)) ? ["course-claim"] : []
    }
  ];
}
function buildIndex(courseRoot) {
  const resolved = path35.resolve(courseRoot);
  const files = import_fast_glob.default.sync(["**/*"], { cwd: resolved, onlyFiles: true, dot: false });
  const chunks = [];
  let fileCount = 0;
  for (const relFile of files) {
    const base = path35.basename(relFile);
    if (SKIP_FILES.has(base)) continue;
    const ext = path35.extname(relFile);
    if (!INDEXABLE_EXT.includes(ext)) continue;
    const full = path35.join(resolved, relFile);
    let content;
    try {
      content = fs36.readFileSync(full, "utf-8");
    } catch {
      continue;
    }
    fileCount++;
    const fileChunks = ext === ".md" ? chunkMarkdown(content, relFile) : chunkWhole(content, relFile);
    chunks.push(...fileChunks);
  }
  return { courseRoot: resolved, builtAt: (/* @__PURE__ */ new Date()).toISOString(), chunks, courseHash: hashCourseDir(resolved) };
}
function indexCourse(coursePathArg, outPath = path35.join(process.cwd(), ".hx-learn-index.json")) {
  const courseRoot = coursePathArg ? path35.resolve(coursePathArg) : defaultCourseRoot();
  const existing = loadIndex(outPath);
  if (existing && existing.courseRoot === courseRoot && existing.courseHash === hashCourseDir(courseRoot)) {
    return { chunkCount: existing.chunks.length, fileCount: new Set(existing.chunks.map((c) => c.file)).size, indexPath: outPath, rebuilt: false };
  }
  const index = buildIndex(courseRoot);
  fs36.writeFileSync(outPath, JSON.stringify(index), "utf-8");
  return { chunkCount: index.chunks.length, fileCount: new Set(index.chunks.map((c) => c.file)).size, indexPath: outPath, rebuilt: true };
}
function loadIndex(indexPath = path35.join(process.cwd(), ".hx-learn-index.json")) {
  if (!fs36.existsSync(indexPath)) return null;
  return JSON.parse(fs36.readFileSync(indexPath, "utf-8"));
}

// src/learn/search.ts
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
}
var K1 = 1.5;
var B = 0.75;
function search(index, query, topN = 5) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];
  const docs = index.chunks.map((c) => ({ chunk: c, terms: tokenize(c.text + " " + c.heading) }));
  const avgLen = docs.reduce((s, d) => s + d.terms.length, 0) / Math.max(docs.length, 1);
  const N = docs.length;
  const df = /* @__PURE__ */ new Map();
  for (const term of new Set(queryTerms)) {
    let count = 0;
    for (const d of docs) if (d.terms.includes(term)) count++;
    df.set(term, count);
  }
  const scored = docs.map((d) => {
    let score = 0;
    const len = d.terms.length || 1;
    const headingTerms = new Set(tokenize(d.chunk.heading));
    for (const term of queryTerms) {
      const tf = d.terms.filter((t) => t === term).length;
      if (tf === 0) continue;
      const docFreq = df.get(term) ?? 0;
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      score += idf * (tf * (K1 + 1) / (tf + K1 * (1 - B + B * len / avgLen)));
      if (headingTerms.has(term)) score += idf * 2;
    }
    return { chunk: d.chunk, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
}

// src/learn/ask.ts
async function askCourse(question) {
  let index = loadIndex();
  if (!index) {
    indexCourse();
    index = loadIndex();
  }
  if (!index || index.chunks.length === 0) {
    return `No course index found and auto-build failed. Expected course at: ${defaultCourseRoot()}
Run \`hx learn index [path]\` with an explicit path if the course mirror lives elsewhere.`;
  }
  const results = search(index, question, 5);
  if (results.length === 0) {
    return "No matching passages found in the indexed course content.";
  }
  const lines = [];
  lines.push(`Question: ${question}`);
  lines.push("");
  lines.push("Top passages (retrieval-only; no model synthesis without a real adapter):");
  lines.push("");
  for (const r of results) {
    const claimLabel = r.chunk.issueTags.includes("course-claim") ? " [course claim, unverified \u2014 see docs/COURSE-ISSUES.md B4]" : "";
    lines.push(`--- ${r.chunk.file} \xA7 ${r.chunk.heading}${claimLabel} (score ${r.score.toFixed(2)}) ---`);
    lines.push(r.chunk.text.slice(0, 600).trim());
    lines.push("");
  }
  return lines.join("\n");
}

// src/learn/quiz.ts
function generateQuiz(lectureSlug, count = 5) {
  let index = loadIndex();
  if (!index) {
    indexCourse();
    index = loadIndex();
  }
  if (!index) return [];
  const lectureChunks = index.chunks.filter((c) => c.file.includes(lectureSlug) && c.heading !== "(preamble)");
  const questions = [];
  for (const chunk of lectureChunks.slice(0, count)) {
    const firstSentence = chunk.text.split(/(?<=[.!?])\s/)[0]?.slice(0, 200) ?? chunk.text.slice(0, 200);
    questions.push({
      question: `Under "${chunk.heading}", what does the course say about: "${firstSentence}..."? Explain in your own words, then check against the source.`,
      citation: `${chunk.file} \xA7 ${chunk.heading}`,
      passage: chunk.text.slice(0, 400)
    });
  }
  return questions;
}
function formatQuiz(questions) {
  if (questions.length === 0) return "No content found for that lecture slug.";
  const lines = [];
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.question}`);
    lines.push(`   (source: ${q.citation})`);
    lines.push("");
  });
  lines.push("Answer each, then re-run with --reveal to see the cited passages.");
  return lines.join("\n");
}

// src/learn/progress.ts
var fs37 = __toESM(require("node:fs"), 1);
var path36 = __toESM(require("node:path"), 1);
var DEFAULT_PATH = path36.join(process.cwd(), ".hx-learn-progress.json");
function loadProgress(p = DEFAULT_PATH) {
  if (!fs37.existsSync(p)) return { lecturesRead: [], projectsDone: [], quizScores: [] };
  return JSON.parse(fs37.readFileSync(p, "utf-8"));
}
function saveProgress(progress, p = DEFAULT_PATH) {
  fs37.writeFileSync(p, JSON.stringify(progress, null, 2) + "\n", "utf-8");
}
function markLectureRead(lecture, p = DEFAULT_PATH) {
  const progress = loadProgress(p);
  if (!progress.lecturesRead.includes(lecture)) progress.lecturesRead.push(lecture);
  saveProgress(progress, p);
  return progress;
}
function recordQuizScore(lecture, score, total, p = DEFAULT_PATH) {
  const progress = loadProgress(p);
  progress.quizScores.push({ lecture, score, total, at: (/* @__PURE__ */ new Date()).toISOString() });
  saveProgress(progress, p);
  return progress;
}
var LECTURE_ORDER = Array.from({ length: 14 }, (_, i) => `lecture-${String(i + 1).padStart(2, "0")}`);
var METHOD_MAP = [
  { keyword: /cold.?start|rediscover/i, lecture: "lecture-03" },
  { keyword: /scope|sprawl|overreach/i, lecture: "lecture-07" },
  { keyword: /premature|victory|declares? done/i, lecture: "lecture-09" },
  { keyword: /fragile startup|init/i, lecture: "lecture-06" },
  { keyword: /handoff|continuity/i, lecture: "lecture-05" },
  { keyword: /subjective|review quality/i, lecture: "lecture-11" }
];
function suggestNext(symptom, progress) {
  if (symptom) {
    const match = METHOD_MAP.find((m) => m.keyword.test(symptom));
    if (match) return match.lecture;
  }
  const nextUnread = LECTURE_ORDER.find((l) => !progress.lecturesRead.includes(l));
  return nextUnread ?? "(all lectures marked read)";
}

// src/kit/issue.ts
var import_node_child_process15 = require("node:child_process");

// src/issues/status.ts
var IssueStatusError = class extends Error {
};
function triageIssue(issue2, opts) {
  if (issue2.frontmatter.status !== "open") {
    throw new IssueStatusError(`Cannot triage ${issue2.frontmatter.id}: status is "${issue2.frontmatter.status}", expected "open".`);
  }
  issue2.frontmatter.status = "triaged";
  issue2.frontmatter.skill = opts.skill;
  if (opts.scope) issue2.frontmatter.scope = opts.scope;
  if (opts.verification) issue2.frontmatter.verification = opts.verification;
  return issue2;
}
function startIssue(issue2, opts = {}) {
  if (issue2.frontmatter.status !== "triaged" && issue2.frontmatter.status !== "resolved-pending-review") {
    throw new IssueStatusError(
      `Cannot start ${issue2.frontmatter.id}: status is "${issue2.frontmatter.status}", expected "triaged" (or restarting after a rejected review).`
    );
  }
  const cap = opts.maxAttempts;
  if (cap !== void 0 && issue2.frontmatter.attempts >= cap) {
    throw new IssueStatusError(
      `${issue2.frontmatter.id} has already had ${issue2.frontmatter.attempts} attempt(s), which meets maxAttempts=${cap}. Stop and report the blocker instead of retrying: say what was tried, what the verification command actually printed, and what you think is in the way. A human can raise maxAttempts in .claude/hx.config.json, re-scope the issue with \`hx issue triage ${issue2.frontmatter.id} --scope ...\`, or close it with \`hx issue wontfix ${issue2.frontmatter.id} --reason "..."\`.`
    );
  }
  issue2.frontmatter.status = "in_progress";
  issue2.frontmatter.attempts += 1;
  return issue2;
}
function markResolvedPendingReview(issue2) {
  if (issue2.frontmatter.status !== "in_progress") {
    throw new IssueStatusError(`Cannot resolve ${issue2.frontmatter.id}: status is "${issue2.frontmatter.status}", expected "in_progress".`);
  }
  issue2.frontmatter.status = "resolved-pending-review";
  return issue2;
}
function insideAgentSession(env2 = process.env) {
  return env2.CLAUDECODE === "1" || env2.CLAUDE_CODE_ENTRYPOINT !== void 0;
}
function closeIssue(issue2, opts) {
  if (issue2.frontmatter.status !== "resolved-pending-review") {
    throw new IssueStatusError(`Cannot close ${issue2.frontmatter.id}: status is "${issue2.frontmatter.status}", expected "resolved-pending-review".`);
  }
  if (opts.autonomy === "review" && opts.actor !== "human") {
    throw new IssueStatusError(
      `${issue2.frontmatter.id} requires human review before closing (autonomy=review). Run \`hx issue close ${issue2.frontmatter.id} --human\`.`
    );
  }
  if (opts.autonomy === "review" && opts.actor === "human" && opts.insideAgentSession) {
    throw new IssueStatusError(
      `${issue2.frontmatter.id} was closed with --human from inside an agent session, which is exactly what --human is meant to exclude. Under autonomy="review" the close is the human's decision, not the agent's: report that the issue is ready and let the user run \`hx issue close ${issue2.frontmatter.id} --human\` in their own terminal. If this project should let agents close their own work, set autonomy to "commit" or "full" in .claude/hx.config.json \u2014 a deliberate, recorded choice rather than a flag.`
    );
  }
  issue2.frontmatter.status = "closed";
  return issue2;
}
function wontfixIssue(issue2, reason) {
  if (!reason.trim()) throw new IssueStatusError("wontfix requires a reason.");
  issue2.frontmatter.status = "wontfix";
  return issue2;
}
function reopenAfterRejection(issue2, reason) {
  if (issue2.frontmatter.status !== "resolved-pending-review") {
    throw new IssueStatusError(`Cannot reject ${issue2.frontmatter.id}: status is "${issue2.frontmatter.status}", expected "resolved-pending-review".`);
  }
  issue2.frontmatter.status = "triaged";
  issue2.body += `

## Review Rejected (${(/* @__PURE__ */ new Date()).toISOString()})

${reason}
`;
  return issue2;
}

// src/issues/router.ts
var fs38 = __toESM(require("node:fs"), 1);
var path37 = __toESM(require("node:path"), 1);
var import_picomatch5 = __toESM(require_picomatch2(), 1);
var SOURCE_DEFAULTS = {
  "test-failure": { skill: "run-tests", agents: ["test-writer", "fixer", "verifier"] },
  cleanup: { skill: "harness", agents: ["fixer", "verifier"] },
  "rule-violation": { skill: "harness", agents: ["fixer", "verifier"] },
  "todo-marker": { skill: "harness", agents: ["fixer", "verifier"] },
  manual: { skill: "issue-solve", agents: ["triager", "fixer", "verifier"] }
};
function loadConfigRoutes(targetDir) {
  const p = path37.join(path37.resolve(targetDir), ".claude", "hx.config.json");
  if (!fs38.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs38.readFileSync(p, "utf-8"));
    return Array.isArray(raw.routes) ? raw.routes : [];
  } catch {
    return [];
  }
}
function routeIssue(targetDir, issue2) {
  if (issue2.frontmatter.skill) {
    return { skill: issue2.frontmatter.skill, agents: SOURCE_DEFAULTS[issue2.frontmatter.source].agents };
  }
  const configRoutes = loadConfigRoutes(targetDir);
  for (const route2 of configRoutes) {
    const isMatch = (0, import_picomatch5.default)(route2.scope);
    if (issue2.frontmatter.scope.some((s) => isMatch(s))) {
      return { skill: route2.skill, agents: route2.agents ?? SOURCE_DEFAULTS[issue2.frontmatter.source].agents };
    }
  }
  return SOURCE_DEFAULTS[issue2.frontmatter.source];
}

// src/issues/detect.ts
var crypto6 = __toESM(require("node:crypto"), 1);
function sig(parts) {
  return crypto6.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}
function detectIssues(targetDir) {
  const created = [];
  for (const violation of runAllRules(targetDir)) {
    const signature = sig(["rule-violation", violation.ruleId, violation.file, String(violation.line ?? "")]);
    if (findBySignature(targetDir, signature)) continue;
    created.push(
      createIssue(targetDir, {
        title: `[${violation.ruleId}] ${violation.error}`,
        body: `## Repro

${violation.file}${violation.line ? `:${violation.line}` : ""}

## Expected

${violation.fix}

## Actual

${violation.error}

## Log

Why: ${violation.why}
`,
        severity: "medium",
        source: "rule-violation",
        scope: [violation.file],
        signature
      })
    );
  }
  const findings = scanCleanup(targetDir);
  for (const finding of findings) {
    if (finding.severity === "critical" && finding.found.length > 0) {
      const signature = sig(["cleanup", finding.check, finding.found.sort().join(",")]);
      if (findBySignature(targetDir, signature)) continue;
      created.push(
        createIssue(targetDir, {
          title: `[cleanup] ${finding.check}`,
          body: `## Repro

Run \`hx exit\` or \`hx issue detect\` again.

## Expected

${finding.description}

## Actual

Found: ${finding.found.join(", ")}
`,
          // A "critical" cleanup finding (scanCleanup only files an issue for "critical" — see
          // the guard above) IS a critical issue, not merely a "high" one — a tracked .env leaking
          // secrets is exactly the kind of thing `hx watch`'s "new critical issue" signal exists
          // to page a human about (Project 07), not something to note and move on from.
          severity: "critical",
          source: "cleanup",
          signature
        })
      );
    }
    if (finding.check.startsWith("TODO") && finding.found.length > 0) {
      for (const marker of finding.found) {
        const signature = sig(["todo-marker", marker]);
        if (findBySignature(targetDir, signature)) continue;
        const [file] = marker.split(":");
        created.push(
          createIssue(targetDir, {
            title: `[todo] ${marker}`,
            body: `## Repro

${marker}

## Expected

Resolve or explicitly convert to a tracked feature.

## Actual

Marker left in source.
`,
            severity: "low",
            source: "todo-marker",
            scope: file ? [file] : [],
            signature
          })
        );
      }
    }
  }
  return created;
}

// src/kit/issue.ts
var DEBUG_LOG_QUESTIONS = [
  "What failed?",
  "Which signal proves the failure?",
  "Which layer owns the failure?",
  "What changed after the fix?",
  "Did the app restart cleanly?",
  "Did the same workload pass after rerun?"
];
function insertDebugLog(body) {
  if (body.includes("## Debug Log")) return body;
  const section = ["## Debug Log", "", ...DEBUG_LOG_QUESTIONS.map((q) => `- ${q} `), ""].join("\n");
  return body.trimEnd() + "\n\n" + section;
}
function debugLogAllBlank(body) {
  const start = body.indexOf("## Debug Log");
  if (start === -1) return false;
  const nextHeading = body.indexOf("\n## ", start + 1);
  const section = body.slice(start, nextHeading === -1 ? body.length : nextHeading);
  const lines = section.split("\n").map((l) => l.trimEnd());
  return DEBUG_LOG_QUESTIONS.every((q) => lines.includes(`- ${q}`));
}
function runIssueVerification(targetDir, issue2) {
  const paths = resolveProjectPaths(targetDir);
  const timeout = paths.kitConfig?.verifyTimeoutMs ?? 6e5;
  const results = [];
  for (const cmd of issue2.frontmatter.verification) {
    let exitCode = 0;
    let output = "";
    try {
      output = (0, import_node_child_process15.execSync)(cmd, {
        cwd: paths.root,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout,
        killSignal: "SIGKILL"
      });
    } catch (err) {
      if (err?.code === "ETIMEDOUT" || err?.signal === "SIGTERM") {
        exitCode = 124;
        output = `TIMEOUT after ${timeout}ms \u2014 the command did not exit on its own.
Raise verifyTimeoutMs in .claude/hx.config.json if this suite is legitimately slow, or fix whatever is hanging.
` + ((err.stdout ?? "") + (err.stderr ?? ""));
      } else {
        exitCode = typeof err.status === "number" ? err.status : 1;
        output = (err.stdout ?? "") + (err.stderr ?? "");
      }
    }
    const passed = exitCode === 0;
    results.push({ cmd, passed, exitCode, output: output.slice(0, 4e3) });
    if (!passed) break;
  }
  const allPassed = results.length > 0 && results.every((r) => r.passed);
  return { allPassed, results };
}
function formatVerifyFailure(results) {
  const failed = results.find((r) => !r.passed);
  if (!failed) return "";
  const tail = (failed.output ?? "").trimEnd().split("\n").slice(-40).join("\n");
  return [
    `Command: ${failed.cmd}`,
    `Exit code: ${failed.exitCode}`,
    "--- output (last 40 lines) ---",
    tail || "(the command produced no output)"
  ].join("\n");
}
function cmdIssueCreate(targetDir, input) {
  const issue2 = createIssue(targetDir, input);
  new EventLog(resolveProjectPaths(targetDir).hxDir).append("issue.create", { id: issue2.frontmatter.id, source: input.source });
  return issue2;
}
function cmdIssueList(targetDir, status) {
  return listIssues(targetDir, status ? { status } : void 0);
}
function cmdIssueShow(targetDir, id) {
  return getIssue(targetDir, id);
}
function cmdIssueRoute(targetDir, id) {
  return routeIssue(targetDir, getIssue(targetDir, id));
}
function cmdIssueTriage(targetDir, id, opts) {
  const issue2 = getIssue(targetDir, id);
  const route2 = opts.skill ? { skill: opts.skill, agents: [] } : routeIssue(targetDir, issue2);
  triageIssue(issue2, { skill: route2.skill, scope: opts.scope, verification: opts.verification });
  saveIssue(targetDir, issue2);
  new EventLog(resolveProjectPaths(targetDir).hxDir).append("issue.triage", { id, skill: route2.skill });
  return issue2;
}
function cmdIssueStart(targetDir, id) {
  const paths = resolveProjectPaths(targetDir);
  const issue2 = getIssue(targetDir, id);
  startIssue(issue2, { maxAttempts: paths.kitConfig?.maxAttempts });
  issue2.body = insertDebugLog(issue2.body);
  const verification = issue2.frontmatter.verification.map((cmd) => ({ level: "unit", cmd }));
  const exclusions = paths.kitConfig?.handsOff ?? [];
  issue2.frontmatter.contractHash = writeContract(targetDir, "issue", id, issue2.frontmatter.title, issue2.frontmatter.scope, verification, exclusions);
  saveIssue(targetDir, issue2);
  new EventLog(paths.hxDir).append("issue.start", { id, attempt: issue2.frontmatter.attempts });
  return issue2;
}
function cmdIssueVerify(targetDir, id, opts = {}) {
  const issue2 = getIssue(targetDir, id);
  const paths = resolveProjectPaths(targetDir);
  const verification = issue2.frontmatter.verification.map((cmd) => ({ level: "unit", cmd }));
  if (contractChanged({ scope: issue2.frontmatter.scope, verification, contractHash: issue2.frontmatter.contractHash }, paths.kitConfig?.handsOff ?? [])) {
    if (!opts.acceptContractChange) {
      throw new IssueStatusError(
        `ERROR: "${id}"'s scope or verification commands changed since it was started.
WHY: a sprint contract was written when this issue started; the current scope/verification no longer matches it.
FIX: hx issue verify ${id} --accept-contract-change --reason "<why the change was needed>"`
      );
    }
    new EventLog(paths.hxDir).append("contract.changed", { id, reason: opts.reason ?? "(no reason given)" });
    appendDecision(targetDir, { title: `Changed the verification contract for "${issue2.frontmatter.title}"`, reason: opts.reason ?? "(no reason given)" });
    issue2.frontmatter.contractHash = writeContract(
      targetDir,
      "issue",
      id,
      issue2.frontmatter.title,
      issue2.frontmatter.scope,
      verification,
      paths.kitConfig?.handsOff ?? []
    );
  }
  const verify = runIssueVerification(targetDir, issue2);
  const eventLog = new EventLog(resolveProjectPaths(targetDir).hxDir);
  const failed = verify.results.find((r) => !r.passed);
  let journeyResults = null;
  if (verify.allPassed && issue2.frontmatter.journey) {
    journeyResults = cmdJourneyRun(targetDir, issue2.frontmatter.journey);
  }
  const journeyOk = !journeyResults || journeyResults.every((r) => r.passed);
  if (verify.allPassed && journeyOk) {
    markResolvedPendingReview(issue2);
    saveIssue(targetDir, issue2);
  } else if (!verify.allPassed) {
    issue2.body = issue2.body.trimEnd() + `

## Verification failed (${(/* @__PURE__ */ new Date()).toISOString()})

\`\`\`
` + formatVerifyFailure(verify.results) + "\n```\n";
    saveIssue(targetDir, issue2);
  } else {
    issue2.body = issue2.body.trimEnd() + `

## Golden journey "${issue2.frontmatter.journey}" failed (${(/* @__PURE__ */ new Date()).toISOString()})

` + journeyResults.map((r) => `- ${r.name}: run 1 exit ${r.firstExitCode}, run 2 exit ${r.secondExitCode}`).join("\n") + "\n";
    saveIssue(targetDir, issue2);
  }
  const debugLogBlank = debugLogAllBlank(issue2.body);
  const diffHash = verificationFingerprint(resolveProjectPaths(targetDir).root);
  eventLog.append("issue.verify", {
    id,
    allPassed: verify.allPassed,
    commands: verify.results.map((r) => ({ cmd: r.cmd, exitCode: r.exitCode, passed: r.passed })),
    diffHash,
    journeyOk: journeyResults ? journeyOk : null,
    debugLogBlank,
    ...failed ? { failedCmd: failed.cmd, exitCode: failed.exitCode, outputTail: tailLines(failed.output, 20) } : {}
  });
  if (verify.allPassed && journeyOk) {
    eventLog.append("issue.resolved-pending-review", { id });
  }
  return { issue: issue2, verify, journeyResults, debugLogBlank };
}
function tailLines(text, n) {
  return (text ?? "").trimEnd().split("\n").slice(-n).join("\n");
}
function cmdIssueClose(targetDir, id, opts) {
  const paths = resolveProjectPaths(targetDir);
  const autonomy = paths.kitConfig?.autonomy ?? "review";
  const issue2 = getIssue(targetDir, id);
  const agentSession = insideAgentSession();
  closeIssue(issue2, {
    actor: opts.human ? "human" : "agent",
    autonomy,
    insideAgentSession: agentSession
  });
  saveIssue(targetDir, issue2);
  new EventLog(paths.hxDir).append("issue.close", {
    id,
    actor: opts.human ? "human" : "agent",
    agentSession,
    autonomy
  });
  return issue2;
}
function cmdIssueReject(targetDir, id, reason) {
  const issue2 = getIssue(targetDir, id);
  reopenAfterRejection(issue2, reason);
  saveIssue(targetDir, issue2);
  new EventLog(resolveProjectPaths(targetDir).hxDir).append("issue.reject", { id, reason });
  appendLesson(targetDir, { source: "issue.reject", id, title: issue2.frontmatter.title, reason });
  return issue2;
}
function cmdIssueWontfix(targetDir, id, reason) {
  const issue2 = getIssue(targetDir, id);
  wontfixIssue(issue2, reason);
  saveIssue(targetDir, issue2);
  new EventLog(resolveProjectPaths(targetDir).hxDir).append("issue.wontfix", { id, reason });
  appendLesson(targetDir, { source: "issue.wontfix", id, title: issue2.frontmatter.title, reason });
  appendDecision(targetDir, { title: `Won't fix: "${issue2.frontmatter.title}"`, reason });
  return issue2;
}
function cmdIssueDetect(targetDir) {
  const created = detectIssues(targetDir);
  if (created.length > 0) {
    new EventLog(resolveProjectPaths(targetDir).hxDir).append("issue.detect", { created: created.map((i) => i.frontmatter.id) });
  }
  return created;
}

// src/kit/kit-install.ts
var fs39 = __toESM(require("node:fs"), 1);
var path38 = __toESM(require("node:path"), 1);
var import_meta3 = {};
var KitInstallError = class extends Error {
};
function builtKitSourceDir() {
  return path38.join(moduleDir(import_meta3.url), "..", "..", "dist-kit", ".claude");
}
function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const entry of fs39.readdirSync(dir, { withFileTypes: true })) {
    const full = path38.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(path38.relative(base, full));
    }
  }
  return out;
}
function runKitInstall(targetDir, opts = {}) {
  const sourceDir = builtKitSourceDir();
  if (!fs39.existsSync(sourceDir)) {
    throw new KitInstallError(
      `No built kit found at ${sourceDir}. Run \`npm run build:kit\` in the hx source repo first.`
    );
  }
  const resolved = path38.resolve(targetDir);
  const destRoot = path38.join(resolved, ".claude");
  const written = [];
  const skipped = [];
  for (const rel of listFilesRecursive(sourceDir)) {
    const src = path38.join(sourceDir, rel);
    const dest = path38.join(destRoot, rel);
    if (fs39.existsSync(dest) && !opts.force) {
      skipped.push(path38.join(".claude", rel));
      continue;
    }
    fs39.mkdirSync(path38.dirname(dest), { recursive: true });
    fs39.copyFileSync(src, dest);
    written.push(path38.join(".claude", rel));
  }
  try {
    fs39.chmodSync(path38.join(destRoot, "bin", "hx.cjs"), 493);
  } catch {
  }
  return { written, skipped };
}

// src/kit/hooks.ts
var fs42 = __toESM(require("node:fs"), 1);
var crypto7 = __toESM(require("node:crypto"), 1);

// src/kit/pre-tool.ts
var fs40 = __toESM(require("node:fs"), 1);
var path39 = __toESM(require("node:path"), 1);
var import_picomatch6 = __toESM(require_picomatch2(), 1);
var ENV_GLOBS = ["**/.env", "**/.env.local", "**/.env.development", "**/.env.production", "**/.env.staging", "**/.env.test"];
var DEFAULT_PROTECTED_GLOBS = [
  ...ENV_GLOBS,
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/bin/**",
  ".claude/hx.config.json",
  "docs/generated/**"
];
var NEVER_PROTECTED_GLOBS = ["**/.env.example", "**/.env.sample", "**/.env.template"];
function protectedFileGlobs(configProtectedPaths = []) {
  return [...DEFAULT_PROTECTED_GLOBS, ...configProtectedPaths];
}
var SECRET_SHAPED_GLOBS = [
  ...ENV_GLOBS,
  "**/*.pem",
  "**/*.key",
  "**/id_rsa",
  "**/id_ed25519",
  "**/*.p12",
  "**/*.pfx",
  "**/secrets/**",
  "**/*.secret*"
];
var DEFAULT_DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\b/,
  // rm -rf / rm -fr (any flag order)
  /\bgit\s+push\b[^\n]*(--force\b|-f\b)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\s+\.\s*$/,
  /\bgit\s+clean\s+-[a-zA-Z]*f\b/
];
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var READ_TOOLS = /* @__PURE__ */ new Set(["Read", "Grep", "Glob"]);
var SHELL_TOOLS = /* @__PURE__ */ new Set(["Bash", "PowerShell"]);
var SECRET_GLOB_HINTS = [/\.env(\.|$)/i, /\.pem$/i, /\.key$/i, /\bid_rsa\b/i, /\bid_ed25519\b/i, /secrets[/\\]/i, /\.secret/i];
function globPatternLooksSecret(glob) {
  if (!glob) return false;
  if (/\.env\.(example|sample|template)$/i.test(glob)) return false;
  return SECRET_GLOB_HINTS.some((re) => re.test(glob));
}
function splitShellSegments(cmd) {
  const segments = [];
  let buf = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      buf += c;
      continue;
    }
    if (c === "\n" || c === ";") {
      segments.push(buf);
      buf = "";
      continue;
    }
    if (c === "&" && cmd[i + 1] === "&") {
      segments.push(buf);
      buf = "";
      i++;
      continue;
    }
    if (c === "|" && cmd[i + 1] === "|") {
      segments.push(buf);
      buf = "";
      i++;
      continue;
    }
    if (c === "|") {
      segments.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  segments.push(buf);
  return segments.map((s) => s.trim()).filter(Boolean);
}
function tokenizeQuoted(seg) {
  const tokens = [];
  let i = 0;
  const n = seg.length;
  while (i < n) {
    while (i < n && /\s/.test(seg[i])) i++;
    if (i >= n) break;
    let buf = "";
    let quoted = false;
    while (i < n && !/\s/.test(seg[i])) {
      const c = seg[i];
      if (c === "'" || c === '"') {
        quoted = true;
        const q = c;
        i++;
        while (i < n && seg[i] !== q) {
          if (q === '"' && seg[i] === "\\" && i + 1 < n) {
            buf += seg[i + 1];
            i += 2;
            continue;
          }
          buf += seg[i];
          i++;
        }
        i++;
      } else {
        buf += c;
        i++;
      }
    }
    tokens.push({ text: buf, quoted });
  }
  return tokens;
}
var READ_VERBS_BASH = /* @__PURE__ */ new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "wc",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "ls",
  "ll",
  "dir",
  "tree",
  "find",
  "stat",
  "file",
  "du",
  "df",
  "diff",
  "cmp",
  "md5sum",
  "sha1sum",
  "sha256sum",
  "sha512sum",
  "readlink",
  "realpath",
  "which",
  "type",
  "test",
  "echo",
  "printf",
  "true",
  "false",
  "pwd",
  "basename",
  "dirname",
  "sort",
  "uniq",
  "cut",
  "tr",
  "awk",
  "jq",
  "yq",
  "strings",
  "od",
  "xxd",
  "hexdump"
]);
var WRITE_VERBS_BASH = /* @__PURE__ */ new Set([
  "rm",
  "rmdir",
  "mv",
  "cp",
  "install",
  "touch",
  "mkdir",
  "chmod",
  "chown",
  "chattr",
  "ln",
  "tee",
  "dd",
  "truncate",
  "shred",
  "patch"
]);
var READ_VERBS_POWERSHELL = /* @__PURE__ */ new Set([
  "get-content",
  "gc",
  "cat",
  "type",
  "get-childitem",
  "gci",
  "ls",
  "dir",
  "get-item",
  "gi",
  "select-string",
  "sls",
  "test-path",
  "get-location",
  "pwd",
  "resolve-path",
  "get-filehash",
  "compare-object",
  "measure-object",
  "write-output",
  "echo",
  "write-host",
  "get-acl",
  "select-object",
  "where-object",
  "foreach-object"
]);
var WRITE_VERBS_POWERSHELL = /* @__PURE__ */ new Set([
  "set-content",
  "sc",
  "add-content",
  "ac",
  "out-file",
  "remove-item",
  "ri",
  "rm",
  "del",
  "erase",
  "rd",
  "rmdir",
  "copy-item",
  "cp",
  "copy",
  "move-item",
  "mv",
  "move",
  "new-item",
  "ni",
  "mkdir",
  "rename-item",
  "ren",
  "clear-content",
  "clc",
  "set-itemproperty",
  "set-acl",
  "tee-object",
  "tee"
]);
var SCRIPT_VERBS = /* @__PURE__ */ new Set(["node", "python", "python3", "bash", "sh", "pwsh", "powershell", "deno", "bun", "tsx", "ts-node"]);
var WRAPPER_VERBS = /* @__PURE__ */ new Set(["sudo", "time", "env", "nice", "command", "builtin", "exec", "xargs", "npx", "bunx"]);
var READ_SUBCOMMANDS = {
  git: /* @__PURE__ */ new Set(["status", "log", "diff", "show", "blame", "ls-files", "rev-parse", "describe", "grep", "branch", "tag", "config", "remote"]),
  gh: /* @__PURE__ */ new Set(["view", "list", "status"]),
  npm: /* @__PURE__ */ new Set(["ls", "list", "view", "outdated"]),
  pnpm: /* @__PURE__ */ new Set(["ls", "list", "view", "outdated"]),
  yarn: /* @__PURE__ */ new Set(["list", "info"]),
  docker: /* @__PURE__ */ new Set(["ps", "images", "logs", "inspect"])
};
var WRITE_SUBCOMMANDS = {
  git: /* @__PURE__ */ new Set(["add", "rm", "mv", "commit", "checkout", "switch", "restore", "reset", "clean", "rebase", "merge", "pull", "push", "stash", "apply", "am", "cherry-pick", "filter-branch"]),
  npm: /* @__PURE__ */ new Set(["install", "ci", "uninstall", "i"]),
  pnpm: /* @__PURE__ */ new Set(["install", "add", "remove", "i"])
};
var PATTERN_FLAGS = /* @__PURE__ */ new Set([
  "-name",
  "-iname",
  "-path",
  "-ipath",
  "-regex",
  "-wholename",
  "--exclude",
  "--exclude-dir",
  "--include",
  "--glob",
  "-g",
  "-e",
  "--grep",
  "-m",
  "--filter",
  "-filter",
  "-include",
  "-exclude",
  "-pattern",
  "-value",
  "-body"
]);
function findVerb(tokens) {
  let idx = 0;
  while (idx < tokens.length && !tokens[idx].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[idx].text)) idx++;
  while (idx < tokens.length) {
    const t = tokens[idx].text.toLowerCase();
    if (t === "pnpm" && tokens[idx + 1]?.text.toLowerCase() === "exec") {
      idx += 2;
      continue;
    }
    if (WRAPPER_VERBS.has(t)) {
      idx++;
      continue;
    }
    break;
  }
  if (idx >= tokens.length) return null;
  return { verbIndex: idx, verb: tokens[idx].text.toLowerCase(), subject: tokens[idx + 1]?.text.toLowerCase() };
}
function classifyOperands(segment, shell) {
  const tokens = tokenizeQuoted(segment);
  const found = findVerb(tokens);
  if (!found) return [];
  const { verbIndex, verb, subject } = found;
  const readVerbs = shell === "powershell" ? READ_VERBS_POWERSHELL : READ_VERBS_BASH;
  const writeVerbs = shell === "powershell" ? WRITE_VERBS_POWERSHELL : WRITE_VERBS_BASH;
  let baseMode;
  if (READ_SUBCOMMANDS[verb]?.has(subject ?? "")) baseMode = "read";
  else if (WRITE_SUBCOMMANDS[verb]?.has(subject ?? "")) baseMode = "write";
  else if (readVerbs.has(verb)) baseMode = "read";
  else if (writeVerbs.has(verb)) baseMode = "write";
  else baseMode = "write";
  const operands = [];
  let skipNext = false;
  let redirectMode = null;
  for (let i = verbIndex + 1; i < tokens.length; i++) {
    const raw = tokens[i];
    const text = raw.text;
    const lower = text.toLowerCase();
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (!raw.quoted && (text === ">" || text === ">>" || text === "1>" || text === "2>" || text === "&>" || text === ">|")) {
      redirectMode = "write";
      continue;
    }
    if (!raw.quoted && text === "<") {
      redirectMode = "read";
      continue;
    }
    if (!raw.quoted) {
      const gluedRedirect = text.match(/^(>{1,2}|1>|2>|&>)(.+)$/);
      if (gluedRedirect) {
        operands.push({ token: gluedRedirect[2], mode: "write" });
        continue;
      }
    }
    if (!raw.quoted && text.startsWith("-")) {
      if (PATTERN_FLAGS.has(lower)) skipNext = true;
      continue;
    }
    if (i === verbIndex + 1 && SCRIPT_VERBS.has(verb)) {
      operands.push({ token: text, mode: "read" });
      continue;
    }
    if (!raw.quoted && (/[*?[\]]/.test(text) || text === "." || text === ".." || /^\w+:\/\//.test(text))) {
      redirectMode = null;
      continue;
    }
    const mode = redirectMode ?? baseMode;
    redirectMode = null;
    operands.push({ token: text, mode });
  }
  return operands;
}
function toRepoRelativePosix(root, p) {
  const resolved = path39.isAbsolute(p) ? p : path39.join(root, p);
  return path39.relative(root, resolved).split(path39.sep).join("/");
}
var isNeverProtected = (0, import_picomatch6.default)(NEVER_PROTECTED_GLOBS);
function matchProtected(relPath, protectedGlobs, secretGlobs, allowEditGlobs) {
  if (!relPath || relPath.startsWith("..")) return null;
  if (isNeverProtected(relPath)) return null;
  if (allowEditGlobs.length > 0 && (0, import_picomatch6.default)(allowEditGlobs)(relPath)) return null;
  if (protectedGlobs.length > 0 && (0, import_picomatch6.default)(protectedGlobs)(relPath)) return { kind: "protected" };
  if (secretGlobs.length > 0 && (0, import_picomatch6.default)(secretGlobs)(relPath)) return { kind: "secret" };
  return null;
}
var GENERATED_DOC_GLOB = "docs/generated/**";
var GENERATED_BY_RE = /<!--\s*generated by:\s*(.+?)\s*-->/i;
function isExemptGeneratedDocWrite(root, rel, command) {
  if (!(0, import_picomatch6.default)(GENERATED_DOC_GLOB)(rel)) return false;
  const full = path39.join(root, rel);
  let header;
  try {
    const fd = fs40.openSync(full, "r");
    const buf = Buffer.alloc(2048);
    const bytesRead = fs40.readSync(fd, buf, 0, buf.length, 0);
    fs40.closeSync(fd);
    header = buf.toString("utf-8", 0, bytesRead);
  } catch {
    return false;
  }
  const m = header.match(GENERATED_BY_RE);
  if (!m) return false;
  const declaredCmd = m[1].trim();
  return declaredCmd.length > 0 && command.includes(declaredCmd);
}
function deny(reason) {
  return { decision: "deny", reason };
}
var ALLOW = { decision: "allow" };
function checkPreTool(targetDir, opts, env2 = process.env) {
  const paths = resolveProjectPaths(targetDir);
  const cfg = paths.kitConfig;
  const protectedGlobs = [...DEFAULT_PROTECTED_GLOBS, ...cfg?.protectedPaths ?? []];
  const allowEditGlobs = cfg?.allowEdit ?? [];
  const securityDocPatterns = isAdvancedPack(paths.root) ? parseSecurityDangerousCommands(paths.root) : [];
  const dangerousPatterns = [
    ...DEFAULT_DANGEROUS_PATTERNS,
    ...(cfg?.dangerousCommands ?? []).map((p) => new RegExp(p)),
    ...securityDocPatterns.map((p) => new RegExp(p))
  ];
  const toolName = opts.toolName ?? "";
  const toolInput = opts.toolInput ?? {};
  const protectedAllowed = env2.HX_ALLOW_PROTECTED === "1";
  const dangerousAllowed = env2.HX_ALLOW_DANGEROUS === "1";
  if (EDIT_TOOLS.has(toolName) && !protectedAllowed) {
    const filePath = String(toolInput.file_path ?? toolInput.notebook_path ?? "");
    const rel = toRepoRelativePosix(paths.root, filePath);
    const relFeatureList = toRepoRelativePosix(paths.root, paths.featureListPath);
    const relEventsLog = toRepoRelativePosix(paths.root, path39.join(paths.hxDir, "events.jsonl"));
    if (rel === relFeatureList) {
      return deny(
        `ERROR: direct edit of ${rel} blocked.
WHY: this file is harness-managed state; a hand edit bypasses schema validation and event logging.
FIX: use \`hx feature start/block/reopen\` or \`hx verify\` instead. Set HX_ALLOW_PROTECTED=1 if this edit is intentional.`
      );
    }
    if (rel === relEventsLog) {
      return deny(
        `ERROR: direct edit of ${rel} blocked.
WHY: this is an append-only audit log; hand-editing it defeats its purpose.
FIX: don't edit it directly. Set HX_ALLOW_PROTECTED=1 if this edit is intentional.`
      );
    }
    const match = matchProtected(rel, protectedGlobs, SECRET_SHAPED_GLOBS, allowEditGlobs);
    if (match) {
      return deny(
        `ERROR: edit to ${rel} blocked (${match.kind} path).
WHY: ${match.kind === "secret" ? "this file looks like it holds credentials." : "this file is harness/build configuration, not project code."}
FIX: if this edit is intentional, set HX_ALLOW_PROTECTED=1, or add it to "allowEdit" in .claude/hx.config.json.`
      );
    }
    return ALLOW;
  }
  if (READ_TOOLS.has(toolName) && !protectedAllowed) {
    const filePath = String(toolInput.file_path ?? toolInput.path ?? "");
    const rel = toRepoRelativePosix(paths.root, filePath);
    const match = matchProtected(rel, [], SECRET_SHAPED_GLOBS, allowEditGlobs);
    if (match) {
      return deny(
        `ERROR: read of ${rel} blocked (secret-shaped path).
WHY: this file looks like it holds credentials, and reading it can leak them into the transcript.
FIX: if this read is intentional, set HX_ALLOW_PROTECTED=1, or add it to "allowEdit" in .claude/hx.config.json.`
      );
    }
    const globParam = toolName === "Glob" ? typeof toolInput.pattern === "string" ? toolInput.pattern : "" : typeof toolInput.glob === "string" ? toolInput.glob : "";
    if (globParam && globPatternLooksSecret(globParam) && !(allowEditGlobs.length > 0 && (0, import_picomatch6.default)(allowEditGlobs)(globParam))) {
      return deny(
        `ERROR: ${toolName}'s glob "${globParam}" targets secret-shaped paths.
WHY: this glob can enumerate or return credential-shaped file contents.
FIX: if intentional, set HX_ALLOW_PROTECTED=1, or narrow the glob to avoid ${globParam}.`
      );
    }
    return ALLOW;
  }
  if (SHELL_TOOLS.has(toolName)) {
    const command = String(toolInput.command ?? "");
    for (const segment of splitShellSegments(command)) {
      if (!dangerousAllowed) {
        const matchedDangerous = dangerousPatterns.find((re) => re.test(segment));
        if (matchedDangerous) {
          return deny(
            `ERROR: command segment "${segment}" matches a denied destructive pattern.
WHY: this class of command (force-push, hard reset, recursive delete, forced clean) can discard work with no recovery path.
FIX: run it in your own terminal if intentional, or set HX_ALLOW_DANGEROUS=1 for this session.`
          );
        }
      }
      if (!protectedAllowed) {
        const shell = toolName === "PowerShell" ? "powershell" : "bash";
        for (const { token: rawTok, mode } of classifyOperands(segment, shell)) {
          const rel = toRepoRelativePosix(paths.root, rawTok);
          const applicableProtected = mode === "write" ? protectedGlobs : [];
          const match = matchProtected(rel, applicableProtected, SECRET_SHAPED_GLOBS, allowEditGlobs);
          if (match && match.kind === "protected" && mode === "write" && isExemptGeneratedDocWrite(paths.root, rel, command)) {
            continue;
          }
          if (match) {
            return deny(
              `ERROR: command segment "${segment}" references ${rel} (${match.kind} path, ${mode}).
WHY: ${match.kind === "secret" ? "this file looks like it holds credentials." : "this file is harness/build configuration, not project code."}
FIX: if intentional, set HX_ALLOW_PROTECTED=1, or add it to "allowEdit" in .claude/hx.config.json.`
            );
          }
        }
      }
    }
    return ALLOW;
  }
  return ALLOW;
}
function formatPreToolDecision(result) {
  if (result.decision === "allow") {
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } });
  }
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: result.reason
    }
  });
}

// src/kit/hooks.ts
var import_fast_glob2 = __toESM(require_out4(), 1);
var path41 = __toESM(require("node:path"), 1);

// src/kit/quality.ts
var fs41 = __toESM(require("node:fs"), 1);
var path40 = __toESM(require("node:path"), 1);
var GRADE_RANK = { D: 1, C: 2, B: 3, A: 4 };
function lastVerdict(events, featureId) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "evaluate" && e.featureId === featureId) return e.verdict;
  }
  return null;
}
function gradeDomain(features, events) {
  const passing = features.filter((f) => f.status === "passing");
  if (passing.length === 0) return "D";
  if (passing.length < features.length) return "C";
  const verdicts = passing.map((f) => lastVerdict(events, f.id)).filter((v) => v !== null);
  return verdicts.some((v) => v !== "Accept") ? "B" : "A";
}
function domainKeyGaps(features) {
  const gaps = features.filter((f) => f.status !== "passing").map((f) => `${f.id} (${f.status})`);
  return gaps.length === 0 ? "-" : gaps.join(", ");
}
function buildDomainRows(doc, events) {
  const byArea = /* @__PURE__ */ new Map();
  for (const f of doc.features) {
    if (!f.area) continue;
    const list = byArea.get(f.area) ?? [];
    list.push(f);
    byArea.set(f.area, list);
  }
  return [...byArea.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([domain, features]) => {
    const passing = features.filter((f) => f.status === "passing").length;
    return {
      domain,
      grade: gradeDomain(features, events),
      verification: `${passing}/${features.length} passing`,
      keyGaps: domainKeyGaps(features)
    };
  });
}
function layerGrade(violationCount) {
  if (violationCount === 0) return "A";
  if (violationCount <= 2) return "B";
  if (violationCount <= 5) return "C";
  return "D";
}
function buildLayerRows(root, violations) {
  const layers = resolveProjectPaths(root).kitConfig?.architecture.layers ?? [];
  const layerViolations = violations.filter((v) => v.ruleId === "layer-order");
  return layers.map((layer) => {
    const sourced = layerViolations.filter((v) => v.error.startsWith(`"${layer.name}" imports from`));
    return {
      layer: layer.name,
      grade: layerGrade(sourced.length),
      boundaryEnforcement: sourced.length === 0 ? "0 violations (clean)" : `${sourced.length} violation(s)`,
      keyGaps: sourced.length === 0 ? "-" : [...new Set(sourced.map((v) => v.error))].join("; ")
    };
  });
}
function renderTable(header, rows) {
  const sep7 = header.map(() => "---");
  const lines = [`| ${header.join(" | ")} |`, `| ${sep7.join(" | ")} |`];
  for (const r of rows) lines.push(`| ${r.join(" | ")} |`);
  return lines.join("\n");
}
function replaceSection(content, heading, nextHeading, body) {
  const start = content.indexOf(heading);
  if (start === -1) return content;
  const afterHeading = start + heading.length;
  const end = nextHeading ? content.indexOf(nextHeading, afterHeading) : content.length;
  const sectionEnd = end === -1 ? content.length : end;
  return content.slice(0, afterHeading) + "\n\n" + body + "\n\n" + content.slice(sectionEnd).replace(/^\n+/, "");
}
function parseGrades(content, heading, nextHeading) {
  const start = content.indexOf(heading);
  if (start === -1) return /* @__PURE__ */ new Map();
  const end = nextHeading ? content.indexOf(nextHeading, start) : content.length;
  const section = content.slice(start, end === -1 ? content.length : end);
  const grades = /* @__PURE__ */ new Map();
  for (const line of section.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([ABCD])\s*\|/);
    if (m) grades.set(m[1].trim(), m[2]);
  }
  return grades;
}
function insertTableRow(content, heading, nextHeading, rowLine, placeholderLine) {
  const start = content.indexOf(heading);
  if (start === -1) return content;
  const end = nextHeading ? content.indexOf(nextHeading, start) : content.length;
  const sectionEnd = end === -1 ? content.length : end;
  let section = content.slice(start, sectionEnd).replace(new RegExp(`${placeholderLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n`), "");
  const sepMatch = section.match(/\|[-:| ]+\|\r?\n/);
  if (sepMatch) {
    const insertAt = section.indexOf(sepMatch[0]) + sepMatch[0].length;
    section = section.slice(0, insertAt) + rowLine + "\n" + section.slice(insertAt);
  } else {
    section = section.trimEnd() + "\n" + rowLine + "\n";
  }
  return content.slice(0, start) + section + content.slice(sectionEnd);
}
function readQualityDoc(root) {
  const paths = resolveProjectPaths(root);
  try {
    return fs41.readFileSync(paths.qualityDocPath, "utf-8");
  } catch {
    return readTemplate("quality-document.md");
  }
}
function writeQualityDoc(root, content) {
  const paths = resolveProjectPaths(root);
  fs41.mkdirSync(path40.dirname(paths.qualityDocPath), { recursive: true });
  fs41.writeFileSync(paths.qualityDocPath, content, "utf-8");
}
function appendBenchmarkSnapshot(root, row) {
  const rowLine = `| ${row.date} | ${row.variant} | ${row.completionRate} | ${row.retries} | ${row.defectsBeforeReview} | ${row.notes} |`;
  const content = insertTableRow(readQualityDoc(root), "## Benchmark Snapshots", "## Simplification Log", rowLine, "| | | | | | |");
  writeQualityDoc(root, content);
}
function appendSimplificationLogRow(root, row) {
  const rowLine = `| ${row.date} | ${row.componentRemoved} | ${row.outcome} | ${row.decision} |`;
  const content = insertTableRow(readQualityDoc(root), "## Simplification Log", "## Change History", rowLine, "| | | | |");
  writeQualityDoc(root, content);
}
function cmdQualityUpdate(targetDir) {
  const paths = resolveProjectPaths(targetDir);
  const doc = loadFeatureList(paths.featureListPath);
  const events = new EventLog(paths.hxDir).readAll();
  const violations = runAllRules(paths.root);
  const domains = buildDomainRows(doc, events);
  const layers = buildLayerRows(paths.root, violations);
  let existing;
  try {
    existing = fs41.readFileSync(paths.qualityDocPath, "utf-8");
  } catch {
    existing = readTemplate("quality-document.md");
  }
  const oldDomainGrades = parseGrades(existing, "## Product Domains", "## Architectural Layers");
  const oldLayerGrades = parseGrades(existing, "## Architectural Layers", "## Benchmark Snapshots");
  const date = todayISO();
  const domainRows = domains.length > 0 ? domains.map((d) => [d.domain, d.grade, d.verification, "n/a (no automated signal)", "n/a (no automated signal)", d.keyGaps, date]) : [["(no domains configured \u2014 set a feature's `area`)", "-", "-", "-", "-", "-", "-"]];
  const layerRows = layers.length > 0 ? layers.map((l) => [l.layer, l.grade, l.boundaryEnforcement, "n/a (no automated signal)", l.keyGaps, date]) : [["(no layers configured \u2014 set `architecture.layers` in hx.config.json)", "-", "-", "-", "-", "-"]];
  let content = existing;
  content = replaceSection(
    content,
    "## Product Domains",
    "## Architectural Layers",
    renderTable(["Domain", "Grade", "Verification", "Agent Legibility", "Test Stability", "Key Gaps", "Last Updated"], domainRows)
  );
  content = replaceSection(
    content,
    "## Architectural Layers",
    "## Benchmark Snapshots",
    renderTable(["Layer", "Grade", "Boundary Enforcement", "Agent Legibility", "Key Gaps", "Last Updated"], layerRows)
  );
  content = content.replace(/\r?\n### \{\{DATE\}\}\r?\n\r?\n(?:- [^\r\n]*\r?\n)*/, "\n");
  const promoted = [];
  const demoted = [];
  const allNames = new Map([...domains.map((d) => [d.domain, d.grade]), ...layers.map((l) => [l.layer, l.grade])]);
  for (const [name, grade] of allNames) {
    const old = oldDomainGrades.get(name) ?? oldLayerGrades.get(name);
    if (!old) continue;
    if (GRADE_RANK[grade] > GRADE_RANK[old]) promoted.push(`${name} (${old} -> ${grade})`);
    else if (GRADE_RANK[grade] < GRADE_RANK[old]) demoted.push(`${name} (${old} -> ${grade})`);
  }
  const historyEntry = [
    `
### ${date}`,
    "",
    "- Changes: regenerated Product Domains and Architectural Layers from feature status, evaluator verdicts, and rule violations (`hx quality update`).",
    `- Domains promoted: ${promoted.length === 0 ? "-" : promoted.join(", ")}`,
    `- Domains demoted: ${demoted.length === 0 ? "-" : demoted.join(", ")}`,
    ""
  ].join("\n");
  content = content.trimEnd() + "\n" + historyEntry;
  fs41.mkdirSync(path40.dirname(paths.qualityDocPath), { recursive: true });
  fs41.writeFileSync(paths.qualityDocPath, content, "utf-8");
  new EventLog(paths.hxDir).append("quality.update", {
    domainCount: domains.length,
    layerCount: layers.length,
    promoted: promoted.length,
    demoted: demoted.length
  });
  return { filePath: paths.qualityDocPath, domains, layers, promoted, demoted };
}

// src/kit/hooks.ts
function sha1(text) {
  return crypto7.createHash("sha1").update(text, "utf-8").digest("hex");
}
function logHookOutput(targetDirForLogging, label, result) {
  if (!result.stdout && !result.stderr) return;
  try {
    if (!targetDirForLogging || !fs42.existsSync(targetDirForLogging)) return;
    new EventLog(resolveProjectPaths(targetDirForLogging).hxDir).append("hook.output", {
      hook: label,
      stdoutSha1: result.stdout ? sha1(result.stdout) : null,
      stderrSha1: result.stderr ? sha1(result.stderr) : null,
      exitCode: result.exitCode
    });
  } catch {
  }
}
function safely(label, targetDirForLogging, fn) {
  try {
    const result = fn();
    logHookOutput(targetDirForLogging, label, result);
    return result;
  } catch (err) {
    const message = err.message;
    try {
      if (targetDirForLogging && fs42.existsSync(targetDirForLogging)) {
        new EventLog(resolveProjectPaths(targetDirForLogging).hxDir).append("hook.error", { hook: label, message });
      }
    } catch {
    }
    return {
      exitCode: 0,
      stdout: `hx ${label} hook could not run: ${message}
(Continuing \u2014 the harness never blocks a session because of its own failure. Run \`hx doctor\` to see what is wrong.)`
    };
  }
}
function requireExistingDir(targetDir) {
  if (!fs42.existsSync(targetDir)) {
    throw new Error(
      `target directory does not exist: ${targetDir}. Nothing was written. This usually means the hook received a cwd in the wrong format (a POSIX path on Windows, for example) \u2014 check the hook command in .claude/settings.json.`
    );
  }
}
function runSessionStartHook(targetDir, _opts = {}) {
  return safely("session-start", targetDir, () => {
    const startReport = formatStartReport(runStart(targetDir));
    const open = cmdIssueList(targetDir, "open");
    const triaged = cmdIssueList(targetDir, "triaged");
    const inProgress = cmdIssueList(targetDir, "in_progress");
    const pendingReview = cmdIssueList(targetDir, "resolved-pending-review");
    const ISSUE_LIST_CAP = 10;
    const lines = [
      startReport,
      "",
      "--- open issues ---",
      formatIssueList(open, ISSUE_LIST_CAP),
      "",
      "--- triaged issues ---",
      formatIssueList(triaged, ISSUE_LIST_CAP)
    ];
    if (inProgress.length > 0) {
      lines.push("", "--- IN PROGRESS (picked up but not verified) ---", formatIssueList(inProgress, ISSUE_LIST_CAP));
    }
    if (pendingReview.length > 0) {
      lines.push(
        "",
        "--- AWAITING HUMAN REVIEW (verified; only a human can close these) ---",
        formatIssueList(pendingReview, ISSUE_LIST_CAP),
        "",
        "Tell the user these are ready. Do not close them yourself."
      );
    }
    const logSubStepError = (step2, err) => {
      try {
        if (fs42.existsSync(targetDir)) {
          new EventLog(resolveProjectPaths(targetDir).hxDir).append("hook.error", {
            hook: `session-start:${step2}`,
            message: err.message
          });
        }
      } catch {
      }
    };
    if (fs42.existsSync(targetDir)) {
      const candidates = ["AGENTS.md", "CLAUDE.md", path41.join(".claude", "CLAUDE.md")];
      const foundName = candidates.find((c) => fs42.existsSync(path41.join(targetDir, c)));
      if (foundName) {
        const full = path41.join(targetDir, foundName);
        try {
          const instructionSections = resolveProjectPaths(targetDir).kitConfig?.instructionSections;
          const findings = lintInstructionFile(fs42.readFileSync(full, "utf-8"), path41.dirname(full), foundName, { instructionSections });
          const errorCount = findings.filter((f) => f.severity === "error").length;
          if (errorCount > 0) {
            lines.push("", `WARNING: ${foundName} has ${errorCount} instruction-file calibration error(s) \u2014 run \`hx doctor\` for detail.`);
          }
        } catch (err) {
          logSubStepError("instruction-lint", err);
        }
      }
    }
    if (fs42.existsSync(targetDir)) {
      try {
        const paths = resolveProjectPaths(targetDir);
        const eventLog = new EventLog(paths.hxDir);
        const cleanupEveryDays = paths.kitConfig?.cleanupEveryDays ?? 7;
        const simplifyEveryDays = paths.kitConfig?.simplifyEveryDays ?? 30;
        const daysSince = (type) => {
          const events = eventLog.readByType(type);
          const last = events[events.length - 1];
          return last ? (Date.now() - new Date(last.ts).getTime()) / 864e5 : null;
        };
        const cleanupAge = daysSince("cleanup.run");
        const ablateAge = daysSince("ablate.run");
        if (cleanupAge !== null && cleanupAge > cleanupEveryDays) {
          lines.push("", `REMINDER: hx cleanup last ran ${cleanupAge.toFixed(0)} day(s) ago (every ${cleanupEveryDays} recommended).`);
        }
        if (ablateAge !== null && ablateAge > simplifyEveryDays) {
          lines.push("", `REMINDER: hx ablate last ran ${ablateAge.toFixed(0)} day(s) ago (every ${simplifyEveryDays} recommended).`);
        }
      } catch (err) {
        logSubStepError("cleanup-reminder", err);
      }
    }
    if (fs42.existsSync(targetDir)) {
      try {
        const paths = resolveProjectPaths(targetDir);
        if (paths.layout === "kit") {
          const failing = checkKitWiring(targetDir, { liveProbe: false }).filter((c) => !c.passed);
          if (failing.length > 0) {
            lines.push("", `WARNING: kit wiring has ${failing.length} failing check(s) \u2014 run \`hx doctor\` for detail.`);
            for (const c of failing) lines.push(`  [FAIL] ${c.name} \u2014 ${c.detail}`);
          }
        }
      } catch (err) {
        logSubStepError("kit-wiring", err);
      }
    }
    if (fs42.existsSync(targetDir)) {
      const parseError = rulesFileParseError(resolveProjectPaths(targetDir).hxDir);
      if (parseError) {
        lines.push("", `WARNING: ${parseError} Fix rules.json \u2014 the rule gate is disabled until it parses again.`);
        logSubStepError("rules-parse", new Error(parseError));
      }
      try {
        const signatures = runAllRules(targetDir).map(violationSignature);
        new EventLog(resolveProjectPaths(targetDir).hxDir).append("rules.baseline", { signatures });
      } catch (err) {
        logSubStepError("rules-baseline", err);
      }
    }
    if (fs42.existsSync(targetDir)) {
      try {
        const log = new EventLog(resolveProjectPaths(targetDir).hxDir);
        log.readAll();
        const corrupt = log.corruptLineCount();
        if (corrupt > 0) {
          lines.push("", `WARNING: events.jsonl has ${corrupt} unparseable line(s) \u2014 some history may be lost. Run \`hx doctor\` for detail.`);
        }
      } catch (err) {
        logSubStepError("corrupt-log-check", err);
      }
    }
    if (fs42.existsSync(targetDir)) {
      try {
        writeProtectedBaseline(targetDir);
      } catch (err) {
        logSubStepError("protected-baseline", err);
      }
    }
    return { exitCode: 0, stdout: lines.join("\n") };
  });
}
function snapshotProtectedFiles(root) {
  const paths = resolveProjectPaths(root);
  const globs = protectedFileGlobs(paths.kitConfig?.protectedPaths ?? []);
  const files = import_fast_glob2.default.sync(globs, { cwd: root, onlyFiles: true, dot: true, ignore: ["**/node_modules/**", "**/.git/**"] });
  const map = {};
  for (const rel of files) {
    try {
      map[rel] = crypto7.createHash("sha1").update(fs42.readFileSync(path41.join(root, rel))).digest("hex");
    } catch {
    }
  }
  return map;
}
function writeProtectedBaseline(root) {
  const snapshot = snapshotProtectedFiles(root);
  new EventLog(resolveProjectPaths(root).hxDir).append("protected.baseline", { files: snapshot });
}
function runPostShellHook(targetDir, opts = {}) {
  return safely("post-shell", targetDir, () => {
    if (opts.toolName !== "Bash" && opts.toolName !== "PowerShell") return { exitCode: 0 };
    if (process.env.HX_ALLOW_PROTECTED === "1") return { exitCode: 0 };
    const eventLog = new EventLog(resolveProjectPaths(targetDir).hxDir);
    const baselineEvents = eventLog.readByType("protected.baseline");
    const lastBaseline = baselineEvents[baselineEvents.length - 1];
    const current = snapshotProtectedFiles(targetDir);
    if (!lastBaseline || typeof lastBaseline.files !== "object" || lastBaseline.files === null) {
      eventLog.append("protected.baseline", { files: current });
      return { exitCode: 0 };
    }
    const before = lastBaseline.files;
    const changed = [];
    for (const [rel, hash] of Object.entries(current)) {
      if (before[rel] !== hash) changed.push(rel);
    }
    eventLog.append("protected.baseline", { files: current });
    if (changed.length === 0) return { exitCode: 0 };
    const detail = `ERROR: a shell command changed protected file(s): ${changed.join(", ")}.
WHY: these are harness-managed or credential-shaped paths; a shell command can bypass the pre-check that would normally catch a direct edit (variable expansion, a script file, an interpreter one-liner).
FIX: review the change (git diff -- ${changed.join(" ")}); revert with \`git checkout -- <path>\` if unintended, or set HX_ALLOW_PROTECTED=1 if it was intentional.`;
    return { exitCode: 2, stderr: detail };
  });
}
function runPostEditHook(targetDir, opts = {}) {
  return safely("post-edit", targetDir, () => {
    const problems = [];
    try {
      const { source, result } = cmdDrift(targetDir);
      if (result.hasDrift) problems.push(formatDrift(result, source, source.kind));
    } catch (err) {
      if (!(err instanceof FeatureListError)) throw err;
    }
    try {
      const editedPath = String(opts.toolInput?.file_path ?? opts.toolInput?.notebook_path ?? "");
      const paths = resolveProjectPaths(targetDir);
      const editedRel = editedPath ? path41.relative(paths.root, path41.isAbsolute(editedPath) ? editedPath : path41.join(paths.root, editedPath)).split(path41.sep).join("/") : null;
      const scopedFiles = [.../* @__PURE__ */ new Set([...getChangedFiles(targetDir), ...editedRel && !editedRel.startsWith("..") ? [editedRel] : []])];
      const current = runAllRules(targetDir, scopedFiles);
      const eventLog = new EventLog(resolveProjectPaths(targetDir).hxDir);
      const baselineEvents = eventLog.readByType("rules.baseline");
      const lastBaseline = baselineEvents[baselineEvents.length - 1];
      if (lastBaseline && Array.isArray(lastBaseline.signatures)) {
        const fresh = newViolations(current, new Set(lastBaseline.signatures));
        if (fresh.length > 0) problems.push(formatViolations(fresh));
      }
    } catch {
    }
    if (problems.length > 0) return { exitCode: 2, stderr: problems.join("\n\n") };
    return { exitCode: 0 };
  });
}
function runPreToolHook(targetDir, opts = {}) {
  try {
    const result = checkPreTool(targetDir, opts);
    if (result.decision === "deny" && fs42.existsSync(targetDir)) {
      try {
        new EventLog(resolveProjectPaths(targetDir).hxDir).append("pre-tool.deny", {
          tool: opts.toolName,
          reason: result.reason
        });
      } catch {
      }
    }
    if (result.decision === "deny") {
      return { exitCode: 2, stdout: formatPreToolDecision(result), stderr: result.reason };
    }
    return { exitCode: 0 };
  } catch (err) {
    const message = err.message;
    try {
      if (fs42.existsSync(targetDir)) {
        new EventLog(resolveProjectPaths(targetDir).hxDir).append("hook.error", { hook: "pre-tool", message });
      }
    } catch {
    }
    const reason = `ERROR: the pre-tool safety check itself failed: ${message}
WHY: a check that cannot determine an action is safe must not allow it.
FIX: run \`hx doctor\` to see what is wrong; the next tool call gets a fresh check.`;
    return {
      exitCode: 2,
      stdout: formatPreToolDecision({ decision: "deny", reason }),
      stderr: reason
    };
  }
}
function stopBlockedGuardPath(targetDir, sessionId) {
  return path41.join(resolveProjectPaths(targetDir).hxDir, `.stop-blocked-${sessionId}`);
}
function runStopHook(targetDir, opts = {}) {
  return safely("stop", targetDir, () => {
    const guardPath = opts.sessionId ? stopBlockedGuardPath(targetDir, opts.sessionId) : null;
    if (opts.stopHookActive) {
      if (guardPath) {
        try {
          fs42.rmSync(guardPath, { force: true });
        } catch {
        }
      }
      return { exitCode: 0 };
    }
    const paths = resolveProjectPaths(targetDir);
    const gate = paths.kitConfig?.stopGate ?? "warn";
    if (gate === "off") return { exitCode: 0 };
    if (fs42.existsSync(targetDir)) {
      try {
        runHandoff(targetDir, { sessionId: opts.sessionId });
      } catch {
      }
    }
    const report = runExit(targetDir, { sessionId: opts.sessionId });
    if (report.overallOk) {
      if (guardPath) {
        try {
          fs42.rmSync(guardPath, { force: true });
        } catch {
        }
      }
      return { exitCode: 0 };
    }
    const detail = formatExitReport(report);
    if (gate === "warn") {
      return {
        exitCode: 0,
        stdout: `hx: clean-state check did not pass.

${detail}

(Not blocking \u2014 stopGate is "warn". Set it to "block" in .claude/hx.config.json to make this stop the turn instead.)`
      };
    }
    if (guardPath && fs42.existsSync(guardPath)) {
      try {
        fs42.rmSync(guardPath, { force: true });
      } catch {
      }
      return {
        exitCode: 0,
        stdout: `hx: clean-state check still did not pass, but this session was already blocked once \u2014 letting it stop rather than looping.

${detail}`
      };
    }
    if (guardPath) {
      try {
        fs42.mkdirSync(path41.dirname(guardPath), { recursive: true });
        fs42.writeFileSync(guardPath, (/* @__PURE__ */ new Date()).toISOString(), "utf-8");
      } catch {
      }
    }
    return { exitCode: 2, stderr: detail };
  });
}
function runSessionEndHook(targetDir, opts = {}) {
  return safely("session-end", targetDir, () => {
    requireExistingDir(targetDir);
    const { progressPath, handoffPath } = runHandoff(targetDir, { sessionId: opts.sessionId });
    let qualityNote = "";
    try {
      const { filePath } = cmdQualityUpdate(targetDir);
      qualityNote = ` and ${filePath}`;
    } catch {
    }
    return { exitCode: 0, stdout: `hx: session state written (progress, handoff${qualityNote ? ", quality" : ""}).` };
  });
}
function runPreCompactHook(targetDir, opts = {}) {
  return safely("pre-compact", targetDir, () => {
    requireExistingDir(targetDir);
    const { handoffPath } = runHandoff(targetDir, { sessionId: opts.sessionId });
    new EventLog(resolveProjectPaths(targetDir).hxDir).append("pre-compact", {});
    return { exitCode: 0, stdout: `hx: handoff refreshed at ${handoffPath} before compaction.` };
  });
}

// src/version.ts
var VERSION = "0.6.0";

// src/kit/hook-stdin.ts
function parseHookStdin(raw, onParseError) {
  const cleaned = raw.replace(/^﻿/, "").trim();
  if (!cleaned) return {};
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    onParseError?.(err.message);
    return {};
  }
}

// src/kit/knowledge.ts
var fs43 = __toESM(require("node:fs"), 1);
var path42 = __toESM(require("node:path"), 1);
var ROUTES = {
  architecture: (root) => path42.join(root, "ARCHITECTURE.md"),
  "product-behavior": (root) => path42.join(root, "docs", "product-specs"),
  "design-rationale": (root) => path42.join(root, "docs", "design-docs"),
  "execution-state": (root) => path42.join(root, "docs", "exec-plans"),
  reference: (root) => path42.join(root, "docs", "references"),
  quality: (root) => resolveProjectPaths(root).qualityDocPath,
  reliability: (root) => path42.join(root, "docs", "RELIABILITY.md")
};
function cmdKnowledgeRoute(targetDir, kind) {
  const resolve16 = ROUTES[kind];
  if (!resolve16) {
    throw new FeatureListError(
      `ERROR: unknown knowledge kind "${kind}".
FIX: use one of: ${Object.keys(ROUTES).join(", ")} (see docs/sops/encode-knowledge-into-repo.md).`
    );
  }
  const paths = resolveProjectPaths(targetDir);
  const destination = resolve16(paths.root);
  const isDirectory = !path42.extname(destination);
  let created = false;
  if (isDirectory && !fs43.existsSync(destination)) {
    fs43.mkdirSync(destination, { recursive: true });
    created = true;
  }
  return { kind, destination, isDirectory, created };
}

// src/kit/watch.ts
var fs44 = __toESM(require("node:fs"), 1);
var path43 = __toESM(require("node:path"), 1);
function doctorFailCount(report) {
  let count = (report.initChecks.match(/\[FAIL\]/g) ?? []).length;
  if (report.dependencyCycle) count++;
  if (report.kitWiring) count += report.kitWiring.filter((c) => !c.passed).length;
  if (report.advancedChecks) count += report.advancedChecks.filter((c) => c.status === "WARN").length;
  count += report.verificationLint.length;
  if (report.rulesFileError) count++;
  return count;
}
function watchLogPath(root) {
  return path43.join(resolveProjectPaths(root).hxDir, "watch.log");
}
function appendWatchLog(root, result) {
  const p = watchLogPath(root);
  fs44.mkdirSync(path43.dirname(p), { recursive: true });
  const line = `[${result.timestamp}] doctorFails=${result.doctorFailCount} newIssues=${result.newIssues.length} ruleViolations=${result.ruleViolationCount}${result.hasCriticalNewIssue ? " CRITICAL" : ""}
`;
  fs44.appendFileSync(p, line, "utf-8");
}
function runWatchTick(targetDir) {
  const paths = resolveProjectPaths(targetDir);
  const report = runDoctor(targetDir);
  const created = cmdIssueDetect(targetDir);
  const violations = runAllRules(paths.root);
  const result = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    doctorFailCount: doctorFailCount(report),
    newIssues: created.map((i) => ({ id: i.frontmatter.id, severity: i.frontmatter.severity, title: i.frontmatter.title })),
    ruleViolationCount: violations.length,
    hasCriticalNewIssue: created.some((i) => i.frontmatter.severity === "critical")
  };
  appendWatchLog(paths.root, result);
  new EventLog(paths.hxDir).append("watch.tick", { ...result });
  return result;
}
async function runWatchLoop(targetDir, everyMinutes, opts = {}) {
  let count = 0;
  for (; ; ) {
    try {
      const result = runWatchTick(targetDir);
      opts.onTick?.(result);
    } catch (err) {
      const paths = resolveProjectPaths(targetDir);
      new EventLog(paths.hxDir).append("watch.error", { message: err.message });
    }
    count++;
    if (opts.ticks != null && count >= opts.ticks) return;
    await new Promise((resolve16) => setTimeout(resolve16, everyMinutes * 6e4));
  }
}

// src/kit/bench.ts
var fs46 = __toESM(require("node:fs"), 1);
var path44 = __toESM(require("node:path"), 1);

// src/core/bench.ts
var fs45 = __toESM(require("node:fs"), 1);
var import_node_child_process16 = require("node:child_process");
function loadBenchTasks(filePath) {
  return JSON.parse(fs45.readFileSync(filePath, "utf-8"));
}
function runBenchTask(task, cwd, timeoutMs = 6e5) {
  const start = Date.now();
  let passed = 0;
  const failedCriteria = [];
  for (const c of task.criteria) {
    try {
      (0, import_node_child_process16.execSync)(c.cmd, { cwd, stdio: "ignore", timeout: timeoutMs, killSignal: "SIGKILL" });
      passed++;
    } catch {
      failedCriteria.push(c.description);
    }
  }
  return {
    id: task.id,
    name: task.name,
    category: task.category,
    criteriaTotal: task.criteria.length,
    criteriaPassed: passed,
    pass: passed === task.criteria.length,
    durationMs: Date.now() - start,
    failedCriteria
  };
}
function runBenchSuite(tasks, cwd, timeoutMs) {
  return tasks.map((t) => runBenchTask(t, cwd, timeoutMs));
}

// src/kit/bench.ts
function runRepeats(tasks, cwd, repeat, timeoutMs) {
  const runs = [];
  for (let i = 0; i < repeat; i++) runs.push(runBenchSuite(tasks, cwd, timeoutMs));
  return runs;
}
function statsFor(taskIds, runs) {
  const relevantRuns = runs.map((run) => run.filter((r) => taskIds.includes(r.id)));
  const totalRuns = relevantRuns.reduce((sum, run) => sum + run.length, 0);
  const totalPassed = relevantRuns.reduce((sum, run) => sum + run.filter((r) => r.pass).length, 0);
  const passRate = totalRuns === 0 ? 0 : totalPassed / totalRuns;
  const everPassed = taskIds.filter((id) => relevantRuns.some((run) => run.find((r) => r.id === id)?.pass));
  const completionRate = taskIds.length === 0 ? 0 : everPassed.length / taskIds.length;
  const retries = taskIds.map((id) => {
    const firstPassIndex = relevantRuns.findIndex((run) => run.find((r) => r.id === id)?.pass);
    return firstPassIndex === -1 ? relevantRuns.length : firstPassIndex;
  });
  const avgRetries = retries.length === 0 ? 0 : retries.reduce((a, b) => a + b, 0) / retries.length;
  return { passRate, completionRate, avgRetries };
}
function runBench(targetDir, tasksFile, opts = {}) {
  const tasks = loadBenchTasks(tasksFile);
  if (tasks.length === 0) throw new FeatureListError(`ERROR: ${tasksFile} declares no tasks.
FIX: add at least one task to run a benchmark.`);
  const paths = resolveProjectPaths(targetDir);
  const variant = opts.variant ?? "baseline";
  const repeat = opts.repeat ?? 1;
  const timeoutMs = opts.timeoutMs ?? paths.kitConfig?.verifyTimeoutMs;
  const runs = runRepeats(tasks, paths.root, repeat, timeoutMs);
  const allIds = tasks.map((t) => t.id);
  const categories = [...new Set(tasks.map((t) => t.category))];
  const byCategory = {};
  for (const category of categories) {
    byCategory[category] = statsFor(tasks.filter((t) => t.category === category).map((t) => t.id), runs);
  }
  const overallStats = statsFor(allIds, runs);
  const defectsBeforeReview = (runs[0] ?? []).reduce((sum, r) => sum + r.failedCriteria.length, 0);
  const summary = {
    variant,
    repeat,
    date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    overall: { ...overallStats, defectsBeforeReview },
    byCategory,
    runs
  };
  const outDir = path44.join(paths.hxDir, "bench");
  fs46.mkdirSync(outDir, { recursive: true });
  const outFile = path44.join(outDir, `${variant}-${summary.date}-${Date.now()}.json`);
  fs46.writeFileSync(outFile, JSON.stringify(summary, null, 2), "utf-8");
  appendBenchmarkSnapshot(paths.root, {
    date: summary.date,
    variant: `\`${variant}\``,
    completionRate: `${(overallStats.completionRate * 100).toFixed(0)}%`,
    retries: overallStats.avgRetries.toFixed(1),
    defectsBeforeReview: String(defectsBeforeReview),
    notes: `${repeat} repeat(s), ${tasks.length} task(s)`
  });
  new EventLog(paths.hxDir).append("bench.run", {
    variant,
    repeat,
    passRate: overallStats.passRate,
    completionRate: overallStats.completionRate,
    avgRetries: overallStats.avgRetries,
    defectsBeforeReview,
    outFile
  });
  return summary;
}
function formatBenchSummary(summary) {
  const lines = [`Bench (${summary.variant}, x${summary.repeat}, ${summary.date}):`];
  lines.push(
    `  Overall: completion ${(summary.overall.completionRate * 100).toFixed(0)}%, pass rate ${(summary.overall.passRate * 100).toFixed(0)}%, avg retries ${summary.overall.avgRetries.toFixed(1)}, defects before review ${summary.overall.defectsBeforeReview}`
  );
  for (const [category, stats] of Object.entries(summary.byCategory)) {
    lines.push(`  [${category}] completion ${(stats.completionRate * 100).toFixed(0)}%, pass rate ${(stats.passRate * 100).toFixed(0)}%, avg retries ${stats.avgRetries.toFixed(1)}`);
  }
  return lines.join("\n");
}
function formatBenchComparison(a, b) {
  const side = (s) => [
    `Harness ${s.variant}:`,
    "",
    `- completion rate: ${(s.overall.completionRate * 100).toFixed(0)}%`,
    `- average retries: ${s.overall.avgRetries.toFixed(1)}`,
    `- bugs caught before human review: ${s.overall.defectsBeforeReview}`
  ].join("\n");
  return [
    "# Benchmark Comparison",
    "",
    side(a),
    "",
    side(b),
    "",
    "Interpretation:",
    "",
    "- Which harness changed the result?",
    "- Which harness changed the cost of getting the result?",
    ""
  ].join("\n");
}

// src/kit/ablate.ts
var fs47 = __toESM(require("node:fs"), 1);
var path45 = __toESM(require("node:path"), 1);
var ABLATABLE_COMPONENTS = ["session-start", "post-edit", "stop", "session-end", "pre-compact", "pre-tool", "rules", "instructions", "state"];
var HOOK_COMPONENT_TO_SETTINGS_KEY = {
  "session-start": "SessionStart",
  "post-edit": "PostToolUse",
  stop: "Stop",
  "session-end": "SessionEnd",
  "pre-compact": "PreCompact",
  "pre-tool": "PreToolUse"
};
var NOOP = () => {
};
function renameAside(target) {
  const bak = `${target}.ablate-bak`;
  fs47.renameSync(target, bak);
  return { restore: () => fs47.renameSync(bak, target), note: `moved ${path45.basename(target)} aside for the duration of the run` };
}
function disableComponent(root, component) {
  const paths = resolveProjectPaths(root);
  const hookKey = HOOK_COMPONENT_TO_SETTINGS_KEY[component];
  if (hookKey) {
    if (paths.layout !== "kit") {
      return { restore: NOOP, applicable: false, note: "root layout has no .claude/settings.json hooks to disable" };
    }
    const settingsPath = path45.join(paths.root, ".claude", "settings.json");
    if (!fs47.existsSync(settingsPath)) {
      return { restore: NOOP, applicable: false, note: "no .claude/settings.json found" };
    }
    const original = fs47.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(original);
    const hadHook = Boolean(settings.hooks?.[hookKey]);
    if (settings.hooks) delete settings.hooks[hookKey];
    fs47.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    return {
      restore: () => fs47.writeFileSync(settingsPath, original, "utf-8"),
      applicable: hadHook,
      note: hadHook ? `removed hooks.${hookKey} from settings.json` : `hooks.${hookKey} was not present to begin with`
    };
  }
  if (component === "rules") {
    const rulesPath = path45.join(paths.hxDir, "rules.json");
    if (!fs47.existsSync(rulesPath)) return { restore: NOOP, applicable: false, note: "no stored rules.json to disable" };
    const { restore, note } = renameAside(rulesPath);
    return { restore, applicable: true, note };
  }
  if (component === "instructions") {
    const candidates = ["AGENTS.md", "CLAUDE.md"].map((f) => path45.join(paths.root, f)).filter((f) => fs47.existsSync(f));
    if (candidates.length === 0) return { restore: NOOP, applicable: false, note: "no AGENTS.md/CLAUDE.md to disable" };
    const handles = candidates.map((f) => renameAside(f));
    return { restore: () => handles.forEach((h) => h.restore()), applicable: true, note: `moved ${candidates.length} instruction file(s) aside` };
  }
  if (component === "state") {
    if (!fs47.existsSync(paths.featureListPath)) return { restore: NOOP, applicable: false, note: "no feature list to disable" };
    const { restore, note } = renameAside(paths.featureListPath);
    return { restore, applicable: true, note };
  }
  throw new FeatureListError(`ERROR: unknown ablate component "${component}".
FIX: one of ${ABLATABLE_COMPONENTS.join(", ")}.`);
}
function cmdAblate(targetDir, component, tasksFile, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const repeat = opts.repeat ?? 1;
  const baseline = runBench(targetDir, tasksFile, { variant: "baseline", repeat });
  const handle = disableComponent(paths.root, component);
  let ablated;
  try {
    ablated = runBench(targetDir, tasksFile, { variant: "simplified", repeat });
  } finally {
    handle.restore();
  }
  const degraded = ablated.overall.completionRate < baseline.overall.completionRate || ablated.overall.passRate < baseline.overall.passRate;
  const outcome = degraded ? "degraded" : "unchanged";
  const suggestedDecision = degraded ? "restore" : "keep removed";
  appendSimplificationLogRow(paths.root, {
    date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    componentRemoved: component,
    outcome,
    decision: suggestedDecision
  });
  new EventLog(paths.hxDir).append("ablate.run", { component, applicable: handle.applicable, note: handle.note, outcome, suggestedDecision });
  return { component, applicable: handle.applicable, note: handle.note, baseline, ablated, outcome, suggestedDecision };
}
function formatAblateResult(r) {
  return [
    `Ablate: ${r.component} (${r.applicable ? r.note : `not applicable \u2014 ${r.note}`})`,
    `  Baseline:  completion ${(r.baseline.overall.completionRate * 100).toFixed(0)}%, pass rate ${(r.baseline.overall.passRate * 100).toFixed(0)}%`,
    `  Ablated:   completion ${(r.ablated.overall.completionRate * 100).toFixed(0)}%, pass rate ${(r.ablated.overall.passRate * 100).toFixed(0)}%`,
    `  Outcome: ${r.outcome} -> suggested decision: ${r.suggestedDecision}`
  ].join("\n");
}

// src/kit/cleanup.ts
var fs48 = __toESM(require("node:fs"), 1);
function cmdCleanup(targetDir, opts = {}) {
  const paths = resolveProjectPaths(targetDir);
  const cleanupFindings = scanCleanup(paths.root);
  const ruleViolations = runAllRules(paths.root);
  const qualityUpdate = cmdQualityUpdate(targetDir);
  const createdIssues = cmdIssueDetect(targetDir);
  const benchSummary = opts.tasksFile && fs48.existsSync(opts.tasksFile) ? runBench(targetDir, opts.tasksFile, { variant: "baseline", repeat: 1 }) : null;
  new EventLog(paths.hxDir).append("cleanup.run", {
    criticalFindings: cleanupFindings.filter((f) => f.severity === "critical" && f.found.length > 0).length,
    ruleViolations: ruleViolations.length,
    createdIssues: createdIssues.length,
    benched: benchSummary !== null
  });
  return { cleanupFindings, ruleViolations, qualityUpdate, createdIssues, benchSummary };
}
function formatCleanupResult(r) {
  const lines = ["Cleanup:"];
  const critical = r.cleanupFindings.filter((f) => f.severity === "critical" && f.found.length > 0);
  lines.push(`  ${critical.length} critical cleanup finding(s), ${r.ruleViolations.length} rule violation(s)`);
  lines.push(`  Quality document updated: ${r.qualityUpdate.filePath}`);
  lines.push(`  ${r.createdIssues.length} new cleanup issue(s) filed${r.createdIssues.length > 0 ? ": " + r.createdIssues.map((i) => i.frontmatter.id).join(", ") : ""}`);
  lines.push(r.benchSummary ? `  Bench slice: completion ${(r.benchSummary.overall.completionRate * 100).toFixed(0)}%` : "  No bench slice configured (pass --tasks to include one).");
  return lines.join("\n");
}

// src/cli.ts
var program2 = new Command();
program2.name("hx").description("Harness engineering toolkit built from Learn Harness Engineering").version(VERSION);
function isExpectedError(err) {
  return err instanceof Error && (["FeatureListError", "IssueStoreError", "IssueStatusError"].includes(err.constructor.name) || /^No checkpoint found|^Graph routing is unresolved|^Unknown node|^Thread .* is not waiting|^No such feature|^No such issue/.test(
    err.message
  ));
}
process.on("uncaughtException", (err) => {
  if (isExpectedError(err)) {
    console.error(`hx: ${err.message}`);
    process.exit(1);
  }
  throw err;
});
process.on("unhandledRejection", (err) => {
  if (isExpectedError(err)) {
    console.error(`hx: ${err.message}`);
    process.exit(1);
  }
  throw err;
});
program2.command("init [path]").description("Scaffold a harness in a repository").option("--advanced", "Also scaffold the advanced repo-template layer").option("--force", "Overwrite existing files").option("--no-commit", "Skip the baseline commit (Lecture 6 step 5) \u2014 on by default").action((p = ".", opts) => {
  const written = runInit(p, { advanced: opts.advanced, force: opts.force, commit: opts.commit !== false });
  console.log(written.length > 0 ? `Wrote:
${written.map((f) => `  ${f}`).join("\n")}` : "Nothing written (all files already exist \u2014 use --force to overwrite).");
  console.log("");
  console.log("Initialization Acceptance Checklist (Lecture 6):");
  for (const item of initAcceptanceChecklist(p)) {
    console.log(`  [${item.passed ? "x" : " "}] ${item.label}`);
  }
});
program2.command("doctor [path]").description("Score repo readiness and lint the harness").option("--full", "also run rule violations, stale-contract, and five-subsystem audit checks; exit 1 on any FAIL").option("--json", "output JSON instead of a formatted report").action((p = ".", opts) => {
  const report = runDoctor(p, { full: !!opts.full });
  console.log(opts.json ? JSON.stringify(report, null, 2) : formatDoctorReport(report));
  if (opts.full) {
    const failCount = doctorFailCount(report) + (report.full.ruleViolations.length > 0 || report.full.staleContracts.length > 0 || report.full.audit.subsystems.some((s) => s.score === 1) ? 1 : 0);
    if (failCount > 0) process.exitCode = 1;
  }
});
program2.command("start [path]").description("Run the fixed session-startup flow").option("--full", "print the full report even on a repeat session (default: short delta after the first start)").action((p = ".", opts) => {
  console.log(formatStartReport(runStart(p, { full: opts.full })));
});
var feature = program2.command("feature").description("Feature list state machine (WIP=1)");
feature.command("list [path]").description("List all features").option("--dag", "print the dependsOn graph as mermaid instead of the plain list").action((p = ".", opts) => {
  const doc = listFeatures(p);
  console.log(opts.dag ? formatFeatureDag(doc) : formatFeatureList(doc));
});
feature.command("start <id>").description("Mark a feature in_progress (enforces WIP=1). Requires --plan in advanced-pack projects.").option("-p, --path <path>", "target directory", ".").option("--plan <path>", "the exec-plan this feature is driven from (docs/exec-plans/active/...)").option("--worktree", "work this feature in its own git worktree (.hx-worktrees/<id>, branch feature/<id>)").action((id, opts) => {
  const { vcrWarning, worktreePath } = cmdStart(opts.path, id, { plan: opts.plan, worktree: opts.worktree });
  console.log(`Started: ${id}`);
  if (vcrWarning) console.log(`WARN: ${vcrWarning}`);
  if (worktreePath) console.log(`Worktree ready: ${worktreePath} (branch feature/${id})`);
});
feature.command("block <id>").description("Mark a feature blocked").requiredOption("-r, --reason <reason>", "why it's blocked").option("-p, --path <path>", "target directory", ".").action((id, opts) => {
  cmdBlock(opts.path, id, opts.reason);
  console.log(`Blocked: ${id} (${opts.reason})`);
});
feature.command("reopen <id>").description("Human-only: reopen a passing feature (logged distinctly from the agent pass gate)").requiredOption("-r, --reason <reason>", "why it's being reopened").option("-p, --path <path>", "target directory", ".").action((id, opts) => {
  cmdReopen(opts.path, id, opts.reason);
  console.log(`Reopened: ${id} (${opts.reason})`);
});
feature.command("reset").description("Human-only: reset every feature to not_started with evidence cleared (Project 01's protocol, for a clean A/B benchmark baseline)").requiredOption("--all", "confirm resetting every feature \u2014 there is no partial/single-feature reset").option("-p, --path <path>", "target directory", ".").action((opts) => {
  const { resetCount } = cmdResetAll(opts.path);
  console.log(`Reset ${resetCount} feature(s) to not_started.`);
});
program2.command("worktree").description("Feature worktree hygiene (A4.4)").command("prune [path]").description("Runs git worktree prune, then removes .hx-worktrees/<id> for every feature no longer in_progress (a worktree with uncommitted changes is left alone, not forced away)").option("--dry-run", "list what would be removed without removing anything").action((p = ".", opts) => {
  const stale = pruneFeatureWorktrees(p, { dryRun: opts.dryRun });
  if (stale.length === 0) {
    console.log("No stale feature worktrees found.");
    return;
  }
  for (const s of stale) console.log(`${opts.dryRun ? "[would remove]" : "[removed or left in place]"} ${s.id} (${s.reason}) \u2014 ${s.path}`);
});
program2.command("verify <id> [path]").description("Run the verification ladder for a feature; only this can mark it passing").option("--attest <note>", "attest a manual verification step (human only)").option("--accept-contract-change", "confirm a scope/verification change since hx feature start was intentional").option("--reason <text>", "why the contract change was needed (recorded in DECISIONS.md)").action((id, p = ".", opts) => {
  if (opts.attest && isThinAttestation(opts.attest)) {
    console.log(
      `WARN: thin attestation (${String(opts.attest).length} chars): say what was observed, with numbers -- e.g. "sidebar collapses at 768px, drawer traps focus, 0 console errors".`
    );
  }
  const result = cmdVerify(p, id, {
    attest: !!opts.attest,
    attestNote: opts.attest,
    acceptContractChange: !!opts.acceptContractChange,
    reason: opts.reason
  });
  console.log(formatLadderResult(result));
  if (!result.allPassed) process.exitCode = 1;
});
function collectPair(val, prev) {
  return [...prev, val];
}
function parseScorePairs(values) {
  const out = {};
  for (const v of values) {
    const [key, val] = v.split("=");
    const n = val !== void 0 ? parseInt(val, 10) : NaN;
    if (key && (n === 0 || n === 1 || n === 2)) out[key.trim().toLowerCase()] = n;
  }
  return out;
}
program2.command("evaluate <id> [path]").description("Run the evaluator rubric standalone (Lecture 9) \u2014 hx verify already runs this automatically after a passing ladder").option("--score <category=N>", "checker/self-estimate for correctness or maintainability, e.g. --score correctness=2 (repeatable)", collectPair, []).option("--human <category=N>", "a human's own score \u2014 wins over --score for the same category, and any disagreement is recorded to the tuning ledger (repeatable)", collectPair, []).action((id, p = ".", opts) => {
  const score = parseScorePairs(opts.score);
  const human = parseScorePairs(opts.human);
  const result = cmdEvaluate(p, id, {
    correctness: score.correctness,
    maintainability: score.maintainability,
    humanCorrectness: human.correctness,
    humanMaintainability: human.maintainability
  });
  console.log(formatEvaluation(result));
  if (result.verdict === "Block") process.exitCode = 1;
});
program2.command("drift [path]").description("Show files changed outside the active feature's declared scope").action((p = ".") => {
  const { source, result } = cmdDrift(p);
  console.log(formatDrift(result, source, source.kind));
  if (result.hasDrift) process.exitCode = 1;
});
program2.command("exit [path]").description("Session-exit clean-state gate").option("--json", "print the report as JSON instead of the formatted checklist").action((p = ".", opts) => {
  const report = runExit(p);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatExitReport(report));
  }
  if (!report.overallOk) process.exitCode = 1;
});
program2.command("handoff [path]").description("Write claude-progress.md and session-handoff.md from repo state").action((p = ".") => {
  const { progressPath, handoffPath } = runHandoff(p);
  console.log(`Updated:
  ${progressPath}
  ${handoffPath}`);
});
var lesson = program2.command("lesson").description("LESSONS.md \u2014 a running log of why things didn't work out");
lesson.command("add <title> <reason>").description("Record a lesson manually (feature block / issue reject / issue wontfix record one automatically)").option("-p, --path <path>", "target directory", ".").option("--id <id>", "an id to associate this lesson with", "manual").action((title, reason, opts) => {
  appendLesson(opts.path, { source: "manual", id: opts.id, title, reason });
  console.log(`Recorded lesson: ${title}`);
});
var decision = program2.command("decision").description("DECISIONS.md \u2014 'what decision, why, when' (Lecture 5)");
decision.command("add <title>").description("Record a design decision").option("-p, --path <path>", "target directory", ".").option("--reason <text>", "why this decision was made").option("--rejected <text>", "what alternative was considered and rejected, and why").option("--constraint <text>", "a constraint this decision imposes going forward").action((title, opts) => {
  appendDecision(opts.path, { title, reason: opts.reason, rejectedAlternative: opts.rejected, constraint: opts.constraint });
  console.log(`Recorded decision: ${title}`);
});
var plan = program2.command("plan").description("Execution plans (advanced pack) \u2014 docs/exec-plans/active -> completed");
plan.command("new <topic>").description("Create docs/exec-plans/active/YYYY-MM-DD-<topic>.md with the six required sections").option("-p, --path <path>", "target directory", ".").action((topic, opts) => {
  const { relPath } = cmdPlanNew(opts.path, topic);
  console.log(`Created: ${relPath}`);
});
plan.command("done <file>").description("Move a plan from active/ to completed/").option("-p, --path <path>", "target directory", ".").action((file, opts) => {
  const { to } = cmdPlanDone(opts.path, file);
  console.log(`Completed: ${to}`);
});
plan.command("list").description("List active and completed plans").option("-p, --path <path>", "target directory", ".").action((opts) => {
  const { active, completed } = cmdPlanList(opts.path);
  console.log(`Active (${active.length}):`);
  for (const f of active) console.log(`  ${f}`);
  console.log(`Completed (${completed.length}):`);
  for (const f of completed) console.log(`  ${f}`);
});
var bench = program2.command("bench").description("Repeated task-suite runs, aggregated pass rate/completion/retries/defects, per variant");
bench.command("run <tasksFile> [path]").description("Run a bench task suite (JSON array of {id, name, category, criteria: [{description, cmd}]}), --repeat times").option("--variant <name>", "baseline | improved | simplified", "baseline").option("--repeat <n>", "how many times to run the whole suite", "1").action((tasksFile, p = ".", opts) => {
  const summary = runBench(p, tasksFile, { variant: opts.variant, repeat: parseInt(opts.repeat, 10) });
  console.log(formatBenchSummary(summary));
  if (summary.overall.completionRate < 1) process.exitCode = 1;
});
bench.command("compare <a> <b>").description("Print the two-question benchmark-comparison template, filled in from two saved bench JSON files").action((a, b) => {
  const summaryA = JSON.parse(fs49.readFileSync(a, "utf-8"));
  const summaryB = JSON.parse(fs49.readFileSync(b, "utf-8"));
  console.log(formatBenchComparison(summaryA, summaryB));
});
program2.command("ablate <component> <tasksFile> [path]").description(`Temporarily disable one component (${ABLATABLE_COMPONENTS.join(" | ")}), rerun a bench slice, restore it, and record the outcome`).option("--repeat <n>", "how many times to run each bench pass", "1").action((component, tasksFile, p = ".", opts) => {
  const result = cmdAblate(p, component, tasksFile, { repeat: parseInt(opts.repeat, 10) });
  console.log(formatAblateResult(result));
});
program2.command("cleanup [path]").description("Scan, structural rules, quality update, suggested cleanup issues, and (with --tasks) a bench slice \u2014 cleanup-loop.md's five steps together").option("--tasks <file>", "a bench task suite to rerun as the confirm-nothing-broke slice").action((p = ".", opts) => {
  const result = cmdCleanup(p, { tasksFile: opts.tasks });
  console.log(formatCleanupResult(result));
});
program2.command("audit [path]").description("Five-subsystem health score (1-5 each), worst first \u2014 reuses the same signals hx doctor already computes").option("--json", "output JSON instead of a formatted report").action((p = ".", opts) => {
  const report = runAudit(p);
  console.log(opts.json ? JSON.stringify(report, null, 2) : formatAuditReport(report));
});
program2.command("watch [path]").description("Deterministic timer loop (no LLM): doctor + issue detect + rule check every N minutes, logged to watch.log").option("--every <minutes>", "interval in minutes", "15").option("--once", "run a single tick and exit, instead of looping").action(async (p = ".", opts) => {
  if (opts.once) {
    const result = runWatchTick(p);
    console.log(`doctorFails=${result.doctorFailCount} newIssues=${result.newIssues.length} ruleViolations=${result.ruleViolationCount}`);
    if (result.hasCriticalNewIssue) {
      console.log(`CRITICAL: ${result.newIssues.filter((i) => i.severity === "critical").map((i) => `${i.id} (${i.title})`).join(", ")}`);
      process.exitCode = 1;
    }
    return;
  }
  console.log(`Watching ${path46.resolve(p)} every ${opts.every} minute(s). Ctrl+C to stop.`);
  await runWatchLoop(p, parseInt(opts.every, 10), {
    onTick: (result) => {
      console.log(`[${result.timestamp}] doctorFails=${result.doctorFailCount} newIssues=${result.newIssues.length} ruleViolations=${result.ruleViolationCount}`);
      if (result.hasCriticalNewIssue) console.log(`CRITICAL: ${result.newIssues.filter((i) => i.severity === "critical").map((i) => i.id).join(", ")}`);
    }
  });
});
var journey = program2.command("journey").description("Golden journeys (docs/RELIABILITY.md) \u2014 run twice, both must exit 0");
journey.command("run [name]").description("Run a named golden journey (or all of them) twice, checking for a deterministic pass").option("-p, --path <path>", "target directory", ".").option("--capture <dir>", "write before.txt/after.txt (each run's output) under <dir>/<journey name>/").action((name, opts) => {
  const results = cmdJourneyRun(opts.path, name, { captureDir: opts.capture });
  console.log(formatJourneyResults(results));
  if (results.some((r) => !r.passed)) process.exitCode = 1;
});
var knowledge = program2.command("knowledge").description("Route invisible knowledge into the repo (advanced pack's encode-knowledge-into-repo SOP)");
knowledge.command("route <kind>").description("Print (and create, if a directory) the destination for a kind of knowledge: architecture, product-behavior, design-rationale, execution-state, reference, quality, reliability").option("-p, --path <path>", "target directory", ".").action((kind, opts) => {
  const route2 = cmdKnowledgeRoute(opts.path, kind);
  console.log(route2.destination);
  if (route2.created) console.log(`(created \u2014 it did not exist yet)`);
});
feature.command("schema").description("Print the feature_list.json JSON Schema (derived from the same zod schema hx validates against)").action(() => {
  console.log(JSON.stringify(featureListJsonSchema(), null, 2));
});
var quality = program2.command("quality").description("QUALITY_SCORE.md \u2014 Product Domains and Architectural Layers, regenerated from durable state");
quality.command("update").description("Regenerate the quality document from feature status, evaluator verdicts, and rule violations (also runs on every SessionEnd)").option("-p, --path <path>", "target directory", ".").action((opts) => {
  const result = cmdQualityUpdate(opts.path);
  console.log(`Updated: ${result.filePath}`);
  console.log(`  ${result.domains.length} domain(s), ${result.layers.length} layer(s)`);
  if (result.promoted.length > 0) console.log(`  Promoted: ${result.promoted.join(", ")}`);
  if (result.demoted.length > 0) console.log(`  Demoted: ${result.demoted.join(", ")}`);
});
var rule = program2.command("rule").description("Executable harness rules (ERROR/WHY/FIX)");
rule.command("add <id> <description>").description(
  "Register a rule (Lecture 10: repeated review feedback -> mechanical check). --type selects the check shape: forbid-pattern (default, --glob/--pattern/--mode), forbid-import (--from-glob/--import-pattern), layer-order (provenance-only \u2014 the actual check is architecture.layers in .claude/hx.config.json). With none of a type's required flags given, the rule is recorded as manual (prose-only, not auto-checked)."
).requiredOption("--from <source>", "where this rule came from (a review comment, an incident, etc.)").option("--type <type>", "forbid-pattern | forbid-import | layer-order", "forbid-pattern").option("--glob <glob>", 'forbid-pattern: which files this rule applies to, e.g. "src/**/*.ts"').option("--pattern <regex>", "forbid-pattern: regex tested against matching files").option("--mode <mode>", "forbid-pattern: forbid: pattern must not appear | require: pattern must appear", "forbid").option("--from-glob <glob>", 'forbid-import: which files this rule applies to, e.g. "src/renderer/**"').option("--import-pattern <regex>", "forbid-import: regex tested against each matching file's import specifiers").option("--fix <text>", "shown as the FIX line on a violation").option("-p, --path <path>", "target directory", ".").action((id, description, opts) => {
  const type = opts.type;
  if (!["forbid-pattern", "forbid-import", "layer-order"].includes(type)) {
    console.error(`--type must be "forbid-pattern", "forbid-import", or "layer-order", got: ${type}`);
    process.exitCode = 1;
    return;
  }
  let check;
  if (type === "forbid-pattern") {
    if (opts.glob && !opts.pattern || opts.pattern && !opts.glob) {
      console.error("--glob and --pattern must be given together to make this rule auto-checked.");
      process.exitCode = 1;
      return;
    }
    if (opts.mode !== "forbid" && opts.mode !== "require") {
      console.error(`--mode must be "forbid" or "require", got: ${opts.mode}`);
      process.exitCode = 1;
      return;
    }
    check = opts.glob && opts.pattern ? { glob: opts.glob, pattern: opts.pattern, mode: opts.mode } : void 0;
  } else if (type === "forbid-import") {
    if (opts.fromGlob && !opts.importPattern || opts.importPattern && !opts.fromGlob) {
      console.error("--from-glob and --import-pattern must be given together to make this rule auto-checked.");
      process.exitCode = 1;
      return;
    }
    check = opts.fromGlob && opts.importPattern ? { type: "forbid-import", from: opts.fromGlob, import: opts.importPattern } : void 0;
  } else {
    check = { type: "layer-order" };
  }
  cmdRuleAdd(opts.path, id, description, opts.from, { check, fix: opts.fix });
  console.log(`Registered rule: ${id}${check ? " (auto-checked)" : " (manual \u2014 not auto-checked)"}`);
});
rule.command("check [path]").description("Run every built-in and auto-checked rule against the repo").action((p = ".") => {
  const violations = cmdRuleCheck(p);
  console.log(formatViolations(violations));
  if (violations.length > 0) process.exitCode = 1;
});
rule.command("list [path]").description("List registered rules").action((p = ".") => {
  console.log(formatRuleList(cmdRuleList(p)));
});
var claims = program2.command("claims").description("Reconcile a report's claims against real verification");
claims.command("check <reportFile> [path]").description("Check a maker-style report's claims against the most recent hx verify / issue verify outcome").action((reportFile, p = ".") => {
  const result = cmdClaimsCheck(p, reportFile);
  console.log(formatReconciliation(result));
  if (result.falseVictory) process.exitCode = 1;
});
var issue = program2.command("issue").description("Local issue flow: create, route, solve, verify, close");
issue.command("create <title>").description("Draft a new issue").option("-p, --path <path>", "target directory", ".").option("--body <text>", "issue body (markdown)").option("--severity <level>", "critical|high|medium|low", "medium").option("--scope <globs...>", "file scope globs").option("--verification <cmds...>", "verification commands").option("--journey <name>", "a golden journey (docs/RELIABILITY.md) to run after verification passes").action((title, opts) => {
  const created = cmdIssueCreate(opts.path, {
    title,
    body: opts.body,
    severity: opts.severity,
    scope: opts.scope,
    verification: opts.verification,
    journey: opts.journey,
    source: "manual"
  });
  console.log(`Created: ${created.frontmatter.id}`);
});
issue.command("list [path]").description("List issues").option("--status <status>", "filter by status").action((p = ".", opts) => {
  console.log(formatIssueList(cmdIssueList(p, opts.status)));
});
issue.command("show <id> [path]").description("Show one issue").action((id, p = ".") => {
  console.log(formatIssue(cmdIssueShow(p, id)));
});
issue.command("route <id> [path]").description("Show which skill/agents an issue would route to, without changing it").action((id, p = ".") => {
  const route2 = cmdIssueRoute(p, id);
  console.log(`skill: ${route2.skill}
agents: ${route2.agents.join(" -> ") || "(none)"}`);
});
issue.command("triage <id>").description("Assign a skill/scope/verification and move the issue to triaged").option("-p, --path <path>", "target directory", ".").option("--skill <skill>", "override the auto-routed skill").option("--scope <globs...>", "file scope globs").option("--verification <cmds...>", "verification commands").action((id, opts) => {
  const updated = cmdIssueTriage(opts.path, id, { skill: opts.skill, scope: opts.scope, verification: opts.verification });
  console.log(`Triaged ${id} -> skill: ${updated.frontmatter.skill}`);
});
issue.command("start <id> [path]").description("Mark an issue in_progress").action((id, p = ".") => {
  cmdIssueStart(p, id);
  console.log(`Started: ${id}`);
});
issue.command("verify <id> [path]").description("Run the issue's verification commands; only a pass advances it to resolved-pending-review").option("--accept-contract-change", "confirm a scope/verification change since hx issue start was intentional").option("--reason <text>", "why the contract change was needed (recorded in DECISIONS.md)").action((id, p = ".", opts) => {
  const { verify, journeyResults, debugLogBlank } = cmdIssueVerify(p, id, { acceptContractChange: !!opts.acceptContractChange, reason: opts.reason });
  for (const r of verify.results) console.log(`[${r.passed ? "PASS" : "FAIL"}] ${r.cmd} (exit ${r.exitCode})`);
  if (!verify.allPassed) {
    console.log("");
    console.log(formatVerifyFailure(verify.results));
    console.log("");
  }
  if (journeyResults) {
    for (const r of journeyResults) console.log(`[${r.passed ? "PASS" : "FAIL"}] journey ${r.name} (run 1: exit ${r.firstExitCode}, run 2: exit ${r.secondExitCode})`);
  }
  const journeyOk = !journeyResults || journeyResults.every((r) => r.passed);
  if (debugLogBlank) console.log("WARN: ## Debug Log is still blank \u2014 see observability-feedback-loop.md's Debug Session Checklist.");
  console.log(verify.allPassed && journeyOk ? "VERDICT: resolved-pending-review" : "VERDICT: still in_progress");
  if (!verify.allPassed || !journeyOk) process.exitCode = 1;
});
issue.command("close <id> [path]").description("Close a resolved-pending-review issue (requires --human unless autonomy allows agents)").option("--human", "confirm this close is a human decision").action((id, p = ".", opts) => {
  cmdIssueClose(p, id, { human: !!opts.human });
  console.log(`Closed: ${id}`);
});
issue.command("reject <id>").description("Send a resolved-pending-review issue back to triaged with feedback").requiredOption("-r, --reason <reason>", "why it was rejected").option("-p, --path <path>", "target directory", ".").action((id, opts) => {
  cmdIssueReject(opts.path, id, opts.reason);
  console.log(`Rejected: ${id} (back to triaged)`);
});
issue.command("wontfix <id>").description("Close an issue as won't-fix").requiredOption("-r, --reason <reason>", "why it won't be fixed").option("-p, --path <path>", "target directory", ".").action((id, opts) => {
  cmdIssueWontfix(opts.path, id, opts.reason);
  console.log(`Marked wontfix: ${id}`);
});
issue.command("detect [path]").description("Scan for rule violations, critical cleanup findings, and TODO markers; draft an issue for each new one").action((p = ".") => {
  const created = cmdIssueDetect(p);
  console.log(created.length > 0 ? created.map((i) => `Created: ${i.frontmatter.id}  ${i.frontmatter.title}`).join("\n") : "No new issues found.");
});
var kit = program2.command("kit").description("The portable .claude/ agent kit");
kit.command("install [path]").description("Copy the .claude/ agent kit into a project").option("--force", "overwrite existing kit files").action((p = ".", opts) => {
  const result = runKitInstall(p, { force: !!opts.force });
  console.log(result.written.length > 0 ? `Installed:
${result.written.map((f) => `  ${f}`).join("\n")}` : "Nothing written (kit already installed \u2014 use --force to overwrite).");
  if (result.skipped.length > 0) {
    console.log(`
Skipped (already present, use --force):
${result.skipped.map((f) => `  ${f}`).join("\n")}`);
  }
});
kit.command("doctor [path]").description("Check that an installed kit is wired correctly").action((p = ".") => {
  console.log(formatDoctorReport(runDoctor(p)));
});
function readStdinJson() {
  if (process.stdin.isTTY) return {};
  let raw;
  try {
    raw = fs49.readFileSync(0, "utf-8");
  } catch {
    return {};
  }
  return parseHookStdin(
    raw,
    (message) => process.stderr.write(`hx: could not parse hook input JSON (${message}); falling back to --path/CLAUDE_PROJECT_DIR.
`)
  );
}
function parseHookOpts(input) {
  return {
    sessionId: typeof input.session_id === "string" ? input.session_id : void 0,
    stopHookActive: input.stop_hook_active === true,
    toolName: typeof input.tool_name === "string" ? input.tool_name : void 0,
    toolInput: input.tool_input && typeof input.tool_input === "object" ? input.tool_input : void 0
  };
}
program2.command("hook <name>").description("Claude Code hook entrypoints: session-start | pre-tool | post-edit | post-shell | stop | session-end | pre-compact").option("-p, --path <path>", "target directory", ".").action((name, opts) => {
  const input = readStdinJson();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || opts.path;
  const hookOpts = parseHookOpts(input);
  let result;
  if (name === "session-start") {
    result = runSessionStartHook(cwd, hookOpts);
  } else if (name === "pre-tool") {
    result = runPreToolHook(cwd, hookOpts);
  } else if (name === "post-edit") {
    result = runPostEditHook(cwd, hookOpts);
  } else if (name === "post-shell") {
    result = runPostShellHook(cwd, hookOpts);
  } else if (name === "stop") {
    result = runStopHook(cwd, hookOpts);
  } else if (name === "session-end") {
    result = runSessionEndHook(cwd, hookOpts);
  } else if (name === "pre-compact") {
    result = runPreCompactHook(cwd, hookOpts);
  } else {
    console.error(
      `Unknown hook: ${name} (expected session-start | pre-tool | post-edit | post-shell | stop | session-end | pre-compact)`
    );
    process.exit(1);
  }
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.exitCode);
});
function collectEnvFile(val, prev) {
  return [...prev, val];
}
var env = program2.command("env").description("Inspect .env files for presence/shape without ever printing values");
env.command("check [keys...]").description(
  "Present/missing, length, whitespace, quoting, and trailing-comment shape for one or more env keys (never prints a value). With no keys, lists the key NAMES found per file."
).option("--file <name>", 'an env file to check instead of the default .env/.env.local (repeatable), a bare basename matching "^\\.env(\\..+)?$"', collectEnvFile, []).option("-p, --path <path>", "target directory", ".").option("--json", "output JSON instead of the formatted report").action((keys, opts) => {
  let result;
  try {
    result = checkEnv(opts.path, keys, { files: opts.file.length > 0 ? opts.file : void 0 });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  console.log(opts.json ? JSON.stringify(result, null, 2) : formatEnvCheck(result));
  if (result.anyMissingOrEmpty) process.exitCode = 1;
});
var logs = program2.command("logs").description("Structured log tools");
logs.command("diagnose <logFile>").description("Diagnose a JSON array of structured log entries").action((logFile) => {
  const entries = JSON.parse(fs49.readFileSync(logFile, "utf-8"));
  console.log(formatDiagnosis(diagnose(entries)));
});
program2.command("loop <goalFile> [path]").description("Run a maker/checker goal loop").option("--adapter <name>", "model adapter: fake | claude", "fake").option("--max-rounds <n>", "override max rounds").option("--planner", "run a one-time Planner role before round 1; its plan is prepended to every Maker prompt").action(async (goalFile, p = ".", opts) => {
  const result = await runGoalLoop({
    goalFile,
    repoRoot: path46.resolve(p),
    adapterName: opts.adapter,
    maxRoundsOverride: opts.maxRounds ? parseInt(opts.maxRounds, 10) : void 0,
    planner: !!opts.planner
  });
  console.log(`Loop finished: ${result.status} after ${result.rounds.length} round(s).`);
  if (result.status !== "goal-met") process.exitCode = 1;
});
var graph = program2.command("graph").description("Maker/checker graph runner");
graph.command("run <graphFile> [path]").description("Run a graph definition").option("--adapter <name>", "model adapter: fake | claude", "fake").option("--thread <id>", "thread id for checkpointing", "session-1").action(async (graphFile, p = ".", opts) => {
  const def = loadGraphDef(graphFile);
  const result = await runGraph(def, {
    repoRoot: path46.resolve(p),
    adapterName: opts.adapter,
    threadId: opts.thread,
    graphFile: path46.resolve(graphFile)
  });
  console.log(`Graph run: ${result.status} (thread=${opts.thread})`);
  if (result.status === "waiting-approval") {
    console.log(`Waiting for approval. Run: hx graph approve ${opts.thread} [path]`);
  }
});
graph.command("resume <thread> [path]").description("Resume a graph run from its checkpoint").option("--adapter <name>", "model adapter: fake | claude", "fake").action(async (thread, p = ".", opts) => {
  const result = await resumeGraph(thread, { repoRoot: path46.resolve(p), adapterName: opts.adapter, threadId: thread });
  console.log(`Resumed: ${result.status}`);
});
graph.command("approve <thread> [path]").description("Approve a waiting human-approval node").option("--adapter <name>", "model adapter: fake | claude", "fake").action(async (thread, p = ".", opts) => {
  const result = await approveInterrupt(thread, true, { repoRoot: path46.resolve(p), adapterName: opts.adapter, threadId: thread });
  console.log(`Approved. Status: ${result.status}`);
});
graph.command("reject <thread> [path]").description("Reject a waiting human-approval node").option("--adapter <name>", "model adapter: fake | claude", "fake").action(async (thread, p = ".", opts) => {
  const result = await approveInterrupt(thread, false, { repoRoot: path46.resolve(p), adapterName: opts.adapter, threadId: thread });
  console.log(`Rejected. Status: ${result.status}`);
});
graph.command("render <graphFile> [outFile]").description("Render a graph definition to graph.md (mermaid + tables) so diagram and code can't drift apart").action((graphFile, outFile = "graph.md") => {
  const def = loadGraphDef(graphFile);
  fs49.writeFileSync(outFile, renderGraphMarkdown(def), "utf-8");
  console.log(`Wrote ${outFile}`);
});
var learn = program2.command("learn").description("Course learning assistant");
learn.command("index [coursePath]").description("Build a local search index over the course").action((coursePath) => {
  const result = indexCourse(coursePath);
  console.log(
    result.rebuilt ? `Indexed ${result.chunkCount} chunks from ${result.fileCount} files into ${result.indexPath}` : `Course directory unchanged since the last index \u2014 ${result.chunkCount} chunks from ${result.fileCount} files, not rebuilt.`
  );
});
learn.command("ask <question>").description("Ask a question grounded in the course, with citations").action(async (question) => {
  const answer = await askCourse(question);
  console.log(answer);
});
learn.command("quiz <lectureSlug>").description("Generate grounded self-check questions for a lecture (e.g. lecture-04)").action((lectureSlug) => {
  console.log(formatQuiz(generateQuiz(lectureSlug)));
});
learn.command("progress").description("Show and update learning progress").option("--read <lecture>", "mark a lecture as read").option("--score <lecture:score:total>", "record a quiz score, e.g. lecture-04:4:5").option("--suggest [symptom]", "suggest the next lecture, optionally from a failure symptom").action((opts) => {
  let progress = loadProgress();
  if (opts.read) progress = markLectureRead(opts.read);
  if (opts.score) {
    const [lecture, score, total] = opts.score.split(":");
    progress = recordQuizScore(lecture, parseInt(score, 10), parseInt(total, 10));
  }
  console.log(`Lectures read: ${progress.lecturesRead.join(", ") || "(none)"}`);
  console.log(`Quiz scores: ${progress.quizScores.map((s) => `${s.lecture}=${s.score}/${s.total}`).join(", ") || "(none)"}`);
  if (opts.suggest !== void 0) {
    const symptom = typeof opts.suggest === "string" ? opts.suggest : void 0;
    console.log(`Suggested next: ${suggestNext(symptom, progress)}`);
  }
});
program2.parseAsync(process.argv);
/*! Bundled license information:

is-extglob/index.js:
  (*!
   * is-extglob <https://github.com/jonschlinkert/is-extglob>
   *
   * Copyright (c) 2014-2016, Jon Schlinkert.
   * Licensed under the MIT License.
   *)

is-glob/index.js:
  (*!
   * is-glob <https://github.com/jonschlinkert/is-glob>
   *
   * Copyright (c) 2014-2017, Jon Schlinkert.
   * Released under the MIT License.
   *)

is-number/index.js:
  (*!
   * is-number <https://github.com/jonschlinkert/is-number>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Released under the MIT License.
   *)

to-regex-range/index.js:
  (*!
   * to-regex-range <https://github.com/micromatch/to-regex-range>
   *
   * Copyright (c) 2015-present, Jon Schlinkert.
   * Released under the MIT License.
   *)

fill-range/index.js:
  (*!
   * fill-range <https://github.com/jonschlinkert/fill-range>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Licensed under the MIT License.
   *)

queue-microtask/index.js:
  (*! queue-microtask. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)

run-parallel/index.js:
  (*! run-parallel. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/
