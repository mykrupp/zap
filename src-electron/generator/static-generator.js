/**
 *
 *    Copyright (c) 2020 Silicon Labs
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

/**
 * @module JS API: generator logic
 */
const Handlebars = require('handlebars/dist/cjs/handlebars')

const {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} = require('fs-extra')

import {
  selectAllClusters,
  selectAllEnums,
  selectAllEnumItems,
  selectAllBitmaps,
  selectAllBitmapFields,
  selectAllStructs,
  selectAllStructItems,
  selectAllCommands,
  selectAllCommandArguments,
  selectAllGlobalCommands,
  selectAllClusterCommands,
} from '../db/query-zcl.js'
import { logError, logInfo } from '../util/env.js'
import {
  getHexValue,
  getStrong,
  getUppercase,
  getLargestStringInArray,
  getSwitch,
  getCase,
  getDefault,
  getCamelCaseWithoutUnderscore,
  isEitherCommandSource,
  isCommandManufactureSpecific,
  getDirection,
  trimNewLinesTabs,
  getFormatCharactersForCommandArguments,
} from '../handlebars/helpers/helper-utils.js'

/**
 * Find the handlebar template file, compile and return the template file.
 * In the case of Generate this will take the template directory mentioned.
 * However in the case of the browser the templates come from the
 * gen-template repository.
 *
 * @param {string} [templateDirectory=""] Directory where the templates reside
 * @param {string} [name=""] Name of the template file
 * @returns A compiled Template
 */
Handlebars.getTemplate = function (templateDirectory = '', name = '') {
  var source = ''
  if (templateDirectory) {
    logInfo('Using ' + templateDirectory + '/' + name + ' as a template')
    source = readFileSync(templateDirectory + '/' + name, 'utf8')
  } else {
    logInfo('Using the test template Directory for ' + name)
    templateDirectory = __dirname + '/../../test/gen-template'
    source = readFileSync(templateDirectory + '/' + name, 'utf8')
  }
  return Handlebars.compile(source)
}

/**
 * Resolve is listed on the map containing the database.
 *
 * @export
 * @param {Object} db database
 * @returns A promise with resolve listed on the map
 */
export function mapDatabase(db) {
  return new Promise((resolve, reject) => {
    var resultantMap = {}
    resultantMap.database = db
    resolve(resultantMap)
  })
}

/**
 * Resolve the handlebar template directory to be able to use the correct
 * handlebar templates for generation/preview.
 *
 * @export
 * @param {Object} map HashMap
 * @param {string} handlebarTemplateDirectory Handlebar template directory path
 * @returns A promise with resolve listed on a map which has the handlebar
 * directory.
 */
export function resolveTemplateDirectory(map, handlebarTemplateDirectory = '') {
  return new Promise((resolve, reject) => {
    map.handlebarTemplateDirectory = handlebarTemplateDirectory
    resolve(map)
  })
}

/**
 * Resolve the compiled handlebar templates for use.
 *
 * @export
 * @param {Object} map Map for database and template directory
 * @param {string[]} templateFiles Array of handlebar template files
 * @returns A promise with resolve listed on a map which has the compiled
 * templates.
 */
export function compileTemplate(map, templateFiles) {
  return new Promise((resolve, reject) => {
    for (var templateFile of templateFiles) {
      var compiledTemplate = Handlebars.getTemplate(
        map.handlebarTemplateDirectory,
        templateFile
      )
      map[templateFile] = compiledTemplate
    }
    resolve(map)
  })
}

/**
 * The database information is retrieved by calling database query
 * functions. Then a resolve is listed on the map containing database, compiled
 * template and database row information so that they can be passed on to more
 * promises.
 *
 * @export
 * @param {Object} map Map for database, template directory and compiled templates
 * @param {string[]} dbRowTypeArray Array of strings with each string representing a
 * type of database row
 * @returns A promise with resolve listed on a map which has the database rows.
 */
export function infoFromDb(map, dbRowTypeArray) {
  return new Promise((resolve, reject) => {
    var db = map.database
    var dbInfo = {}
    for (let dbRowType of dbRowTypeArray) {
      if (
        dbRowType === 'clusters' ||
        dbRowType === 'print-cluster' ||
        dbRowType === 'debug-printing-zcl' ||
        dbRowType === 'callback-zcl' ||
        dbRowType === 'client-command-macro-cluster'
      ) {
        dbInfo[dbRowType] = selectAllClusters(db).then(
          (dbRows) => (map[dbRowType] = dbRows)
        )
      } else if (dbRowType == 'enums') {
        dbInfo[dbRowType] = selectAllEnums(db).then(
          (dbRows) => (map[dbRowType] = dbRows)
        )
      } else if (dbRowType == 'bitmaps') {
        dbInfo[dbRowType] = selectAllBitmaps(db).then(
          (dbRows) => (map[dbRowType] = dbRows)
        )
      } else if (dbRowType === 'af-structs') {
        dbInfo[dbRowType] = selectAllStructs(db).then(
          (dbRows) => (map[dbRowType] = dbRows)
        )
      } else if (
        dbRowType === 'callback-zcl-command' ||
        dbRowType === 'client-command-macro-cluster-commands'
      ) {
        dbInfo[dbRowType] = selectAllCommands(db).then(
          (dbRows) => (map[dbRowType] = dbRows)
        )
      } else if (dbRowType === 'client-command-macro-global') {
        dbInfo[dbRowType] = selectAllGlobalCommands(db).then(
          (dbRows) => (map[dbRowType] = dbRows)
        )
      }
    }
    // Going through an array of promises and resolving them.
    Promise.all(Object.values(dbInfo))
      .then(() => {
        resolve(map)
      })
      .catch((reason) => {
        logError(`infoFromDb Handle rejected promise (${reason}) here.`)
      })
  })
}

/**
 * Additional information attached to each database row. Essentially a way
 * to group by content.
 *
 * @export
 * @param {Object} map Map containing database, compiled templates, database and
 * database rows for different database types.
 * @param {Object} groupByParams Object to group information by
 * @param {string} groupByParams.subItemName
 * @param {string} groupByParams.foreignKey
 * @param {string} groupByParams.primaryKey
 * @param {string} groupByParams.dbType
 * @returns A promise with resolve listed on a map which has the database,
 * compiled templates and database rows along with additional grouped by
 * content.
 */
export function groupInfoIntoDbRow(map, groupByParams) {
  let groupDbRowInfo = []
  let i = 0
  if (groupByParams) {
    for (i = 0; i < groupByParams.length; i++) {
      // Table Name for the creating a sub-list
      let subItemName = groupByParams[i].joinRecords
      // Foreign Key in the table
      let foreignKey = groupByParams[i].foreignKey
      // Primary key in the parent table inorder to join
      let primaryKey = groupByParams[i].primaryKey
      // dbType to call the sql queries on the table
      let dbType = groupByParams[i].dbType

      let db = map.database
      // for eg map[EnumItems], map[BitmapFields], etc
      let dbRows = map[dbType]
      // Collecting the rows having the same key in subDBRows
      let subDbRows = []
      let subItems
      if (groupByParams[i].subItems) {
        subItems = new Promise((resolve, reject) => {
          resolve(map[groupByParams[i].subItems])
        })
      }
      if (!subItems) {
        if (subItemName == 'EnumItems') {
          subItems = selectAllEnumItems(db)
        } else if (subItemName == 'BitmapFields') {
          subItems = selectAllBitmapFields(db)
        } else if (subItemName == 'StructItems') {
          subItems = selectAllStructItems(db)
        } else if (subItemName == 'CommandArguments') {
          subItems = selectAllCommandArguments(db)
        } else {
          return
        }
      }

      groupDbRowInfo[i] = subItems
        .then(
          (rows) =>
            new Promise((resolve, reject) => {
              for (let i = 0; i < rows.length; i++) {
                // create a map here and print in next prmoise to see if it is populated
                if (subDbRows[rows[i][foreignKey]] == null) {
                  subDbRows[rows[i][foreignKey]] = [rows[i]]
                } else {
                  subDbRows[rows[i][foreignKey]].push(rows[i])
                }
              }
              for (let j = 0; j < dbRows.length; j++) {
                var pk = dbRows[j][primaryKey]
                dbRows[j][subItemName] = subDbRows[pk]
              }
              resolve(map)
            })
        )
        .catch((reason) => {
          logError(
            `groupInfoIntoDbRow Handle rejected promise (${reason}) here.`
          )
        })
    }
    // Going through an array of promises and resolving them.
    return Promise.all(groupDbRowInfo)
      .then((results) => map)
      .catch((reason) => {
        logError(`groupInfoIntoDbRow Handle rejected promise (${reason}) here.`)
      })
  } else {
    return new Promise((resolve, reject) => map)
  }
}

/**
 * Resolve the helper functions to be used in later promises.
 *
 * @export
 * @param {Object} map
 * @param {Object} helperFunctions Map for handlebar helper name to helper function
 * @returns A promise with resolve listed on a map which has the helper
 * functions.
 */
export function resolveHelper(map, helperFunctions) {
  return new Promise((resolve, reject) => {
    let handlebarHelpers = {},
      i = 0
    for (i = 0; i < helperFunctions.length; i++) {
      switch (helperFunctions[i]['helperFunctionName']) {
        case 'getUppercase':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getUppercase
          break
        case 'getStrong':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getStrong
          break
        case 'getHexValue':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getHexValue
          break
        case 'getLargestStringInArray':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getLargestStringInArray
          break
        case 'getSwitch':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getSwitch
          break
        case 'getCase':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getCase
          break
        case 'getDefault':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getDefault
          break
        case 'getCamelCaseWithoutUnderscore':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getCamelCaseWithoutUnderscore
          break
        case 'isEitherCommandSource':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = isEitherCommandSource
          break
        case 'isCommandManufactureSpecific':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = isCommandManufactureSpecific
          break
        case 'getDirection':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getDirection
          break
        case 'trimNewLinesTabs':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = trimNewLinesTabs
          break
        case 'getFormatCharactersForCommandArguments':
          handlebarHelpers[
            helperFunctions[i]['helperNameForTemplate']
          ] = getFormatCharactersForCommandArguments
          break
      }
    }
    map.helperFunctions = handlebarHelpers
    resolve(map)
  })
}

/**
 * The database information is used to show the generation output to a preview
 * pane using the compiled handlebar templates.
 *
 * @export
 * @param {Object} map
 * @param {Object[]} databaseRowToHandlebarTemplateFileMap Map linking the
 * database row type with handlebar template file.
 * @param {string} databaseRowToHandlebarTemplateFileMap.dbRowType Database
 * row type
 * @param {string} databaseRowToHandlebarTemplateFileMap.hTemplateFile Handlebar
 * template file
 * @returns A promise with resolve listed on the data which can be seen in the
 * preview pane.
 */
export function generateDataToPreview(
  map,
  databaseRowToHandlebarTemplateFileMap
) {
  return new Promise((resolve, reject) => {
    var result = ''
    for (let i = 0; i < databaseRowToHandlebarTemplateFileMap.length; i++) {
      var compiledTemplate =
        map[databaseRowToHandlebarTemplateFileMap[i].hTemplateFile]
      var dbRows = map[databaseRowToHandlebarTemplateFileMap[i].dbRowType]
      for (var key in map.helperFunctions) {
        Handlebars.registerHelper(key, map.helperFunctions[key])
      }
      var define = compiledTemplate({
        type: dbRows,
      })
      result = result + define
    }
    resolve(result)
  })
}

/**
 * The database information is used to write the generation output to a file
 * using the compiled handlebar templates.
 *
 * @export
 * @param {Object} map
 * @param {string} outputFileName The generation file name
 * @param {Object[]} databaseRowToHandlebarTemplateFileMap Map linking the
 * database row type with handlebar template file.
 * @param {string} databaseRowToHandlebarTemplateFileMap.dbRowType Database
 * row type
 * @param {string} databaseRowToHandlebarTemplateFileMap.hTemplateFile Handlebar
 * template file
 * @returns A new promise resolve listed on the data which is generated.
 */
export function generateDataToFile(
  map,
  outputFileName,
  databaseRowToHandlebarTemplateFileMap
) {
  return new Promise((resolve, reject) => {
    var result = ''
    var generationDirectory = map.generationDirectory
    for (let i = 0; i < databaseRowToHandlebarTemplateFileMap.length; i++) {
      var compiledTemplate =
        map[databaseRowToHandlebarTemplateFileMap[i].hTemplateFile]
      var dbRows = map[databaseRowToHandlebarTemplateFileMap[i].dbRowType]
      for (var key in map.helperFunctions) {
        Handlebars.registerHelper(key, map.helperFunctions[key])
      }
      var define = compiledTemplate({
        type: dbRows,
      })
      if (!existsSync(generationDirectory)) {
        mkdirSync(generationDirectory)
      }
      result = result + define
    }
    resolve(result)
    writeFileSync(generationDirectory + '/' + outputFileName, result)
  })
}

/**
 *
 *
 * @export
 * @param {*} filePath
 * @returns A promise with the generation options
 */
export function getGenerationProperties(filePath) {
  return new Promise((resolve, reject) => {
    let rawData
    let actualFilePath = filePath
    if (!actualFilePath || 0 === actualFilePath.length) {
      actualFilePath =
        __dirname + '/../../test/gen-template/generation-options.json'
    }
    logInfo('Reading generation properties from ' + actualFilePath)
    rawData = readFileSync(actualFilePath)
    var generationOptions = JSON.parse(rawData)
    resolve(generationOptions)
  })
}
