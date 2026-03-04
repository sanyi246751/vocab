/**
 * Google Apps Script Backend for VocabMaster AI
 * 
 * Instructions:
 * 1. Create a Google Sheet.
 * 2. Create three sheets named: "users", "words", "categories".
 * 3. Add headers to each sheet (Row 1):
 *    - users: id, username, avatar, created_at
 *    - words: id, word, phonetic, pos, definition, example, example_translation, example_segments, category, error_count, user_id, deleted_at, created_at
 *    - categories: id, name, user_id, created_at
 * 4. Open Extensions > Apps Script.
 * 5. Paste this code.
 * 6. Deploy > New Deployment > Web App (Set "Who has access" to "Anyone").
 * 7. Copy the Web App URL and paste it into your React app's GAS_URL variable.
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  const action = e.parameter.action;
  const user_id = e.parameter.user_id;
  const id = e.parameter.id;
  const category = e.parameter.category;
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  try {
    switch (action) {
      case 'getUsers':
        return jsonResponse(getData(ss, 'users'));
        
      case 'getStats':
        return jsonResponse(getStats(ss, user_id));
        
      case 'getDifficultWords':
        return jsonResponse(getDifficultWords(ss, user_id));
        
      case 'getTrashWords':
        return jsonResponse(getTrashWords(ss, user_id));
        
      case 'getCategories':
        return jsonResponse(getCategories(ss, user_id));
        
      case 'getWords':
        return jsonResponse(getWords(ss, user_id, category));
        
      case 'export':
        return csvResponse(getWords(ss, user_id, category), category);
        
      default:
        return jsonResponse({ error: 'Invalid GET action: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

function doPost(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let body = {};
  
  if (e.postData && e.postData.contents) {
    body = JSON.parse(e.postData.contents);
  }
  
  try {
    switch (action) {
      case 'addUser':
        return jsonResponse(addUser(ss, body));
        
      case 'restoreWord':
        return jsonResponse(restoreWord(ss, e.parameter.id));
        
      case 'permanentDeleteWord':
        return jsonResponse(permanentDeleteWord(ss, e.parameter.id));
        
      case 'updateWordCategory':
        return jsonResponse(updateWordCategory(ss, e.parameter.id, body.category));
        
      case 'recordError':
        return jsonResponse(recordError(ss, e.parameter.id));
        
      case 'addCategory':
        return jsonResponse(addCategory(ss, body));
        
      case 'renameCategory':
        return jsonResponse(renameCategory(ss, e.parameter.oldName, body.newName, body.user_id));
        
      case 'deleteCategory':
        return jsonResponse(deleteCategory(ss, e.parameter.name, e.parameter.user_id));
        
      case 'addWords':
        return jsonResponse(addWords(ss, body));
        
      case 'bulkUpdateCategory':
        return jsonResponse(bulkUpdateCategory(ss, body));
        
      case 'deleteWord':
        return jsonResponse(deleteWord(ss, e.parameter.id));
        
      default:
        return jsonResponse({ error: 'Invalid POST action: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

// Helper: JSON Response
function jsonResponse(data, status = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Helper: CSV Response
function csvResponse(words, categoryName) {
  const header = "Word,POS,Phonetic,Definition,Example,Category\n";
  const rows = words.map(w => {
    const escape = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
    return `${escape(w.word)},${escape(w.pos)},${escape(w.phonetic)},${escape(w.definition)},${escape(w.example)},${escape(w.category)}`;
  }).join("\n");
  
  return ContentService.createTextOutput(header + rows)
    .setMimeType(ContentService.MimeType.TEXT);
}

// Helper: Get sheet data as objects
function getData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const items = [];
  for (let i = 1; i < values.length; i++) {
    const item = {};
    headers.forEach((h, index) => {
      item[h] = values[i][index];
    });
    items.push(item);
  }
  return items;
}

// Action: addUser
function addUser(ss, body) {
  const sheet = ss.getSheetByName('users');
  const id = sheet.getLastRow(); // Simple ID
  const avatar = body.avatar || `https://picsum.photos/seed/${body.username}/100/100`;
  const createdAt = new Date().toISOString();
  sheet.appendRow([id, body.username, avatar, createdAt]);
  return { id, username: body.username, avatar, created_at: createdAt };
}

// Action: getWords
function getWords(ss, user_id, category) {
  const allWords = getData(ss, 'words');
  return allWords.filter(w => {
    const matchUser = String(w.user_id) === String(user_id);
    const matchActive = !w.deleted_at;
    const matchCat = (!category || category === '全部') ? true : w.category === category;
    return matchUser && matchActive && matchCat;
  }).map(w => {
    try {
      w.example_segments = w.example_segments ? JSON.parse(w.example_segments) : [];
    } catch(e) {
      w.example_segments = [];
    }
    return w;
  });
}

// Action: getTrashWords
function getTrashWords(ss, user_id) {
  const allWords = getData(ss, 'words');
  return allWords.filter(w => String(w.user_id) === String(user_id) && w.deleted_at);
}

// Action: getDifficultWords
function getDifficultWords(ss, user_id) {
  const allWords = getData(ss, 'words');
  return allWords
    .filter(w => String(w.user_id) === String(user_id) && !w.deleted_at && w.error_count > 0)
    .sort((a, b) => b.error_count - a.error_count)
    .slice(0, 20);
}

// Action: getStats
function getStats(ss, user_id) {
  const activeWords = getWords(ss, user_id, '全部');
  const byCategory = {};
  activeWords.forEach(w => {
    byCategory[w.category] = (byCategory[w.category] || 0) + 1;
  });
  return { total: activeWords.length, byCategory };
}

// Action: getCategories
function getCategories(ss, user_id) {
  const allCats = getData(ss, 'categories');
  return allCats
    .filter(c => String(c.user_id) === String(user_id))
    .map(c => c.name);
}

// Action: addCategory
function addCategory(ss, body) {
  const sheet = ss.getSheetByName('categories');
  const id = sheet.getLastRow();
  sheet.appendRow([id, body.name, body.user_id, new Date().toISOString()]);
  return { success: true };
}

// Action: addWords
function addWords(ss, body) {
  const sheet = ss.getSheetByName('words');
  const startId = sheet.getLastRow();
  const createdAt = new Date().toISOString();
  body.words.forEach((w, i) => {
    sheet.appendRow([
      startId + i,
      w.word,
      w.phonetic || '',
      w.pos || '',
      w.definition || '',
      w.example || '',
      w.example_translation || '',
      JSON.stringify(w.example_segments || []),
      body.category || '未分類',
      0,
      body.user_id,
      '',
      createdAt
    ]);
  });
  return { success: true };
}

// Action: updateWordCategory
function updateWordCategory(ss, id, newCategory) {
  const sheet = ss.getSheetByName('words');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 9).setValue(newCategory); // 9th column is category
      return { success: true };
    }
  }
  return { error: 'Word not found' };
}

// Action: bulkUpdateCategory
function bulkUpdateCategory(ss, body) {
  const sheet = ss.getSheetByName('words');
  const data = sheet.getDataRange().getValues();
  const ids = body.ids.map(id => String(id));
  for (let i = 1; i < data.length; i++) {
    if (ids.includes(String(data[i][0]))) {
      sheet.getRange(i + 1, 9).setValue(body.category);
    }
  }
  return { success: true };
}

// Action: recordError
function recordError(ss, id) {
  const sheet = ss.getSheetByName('words');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const current = Number(data[i][9]) || 0;
      sheet.getRange(i + 1, 10).setValue(current + 1); // 10th column is error_count
      return { success: true };
    }
  }
  return { error: 'Word not found' };
}

// Action: deleteWord (Soft delete)
function deleteWord(ss, id) {
  const sheet = ss.getSheetByName('words');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 12).setValue(new Date().toISOString()); // 12th column is deleted_at
      return { success: true };
    }
  }
  return { error: 'Word not found' };
}

// Action: restoreWord
function restoreWord(ss, id) {
  const sheet = ss.getSheetByName('words');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 12).setValue('');
      return { success: true };
    }
  }
  return { error: 'Word not found' };
}

// Action: permanentDeleteWord
function permanentDeleteWord(ss, id) {
  const sheet = ss.getSheetByName('words');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'Word not found' };
}

// Action: renameCategory
function renameCategory(ss, oldName, newName, user_id) {
  // Update categories sheet
  const catSheet = ss.getSheetByName('categories');
  const catData = catSheet.getDataRange().getValues();
  for (let i = 1; i < catData.length; i++) {
    if (catData[i][1] === oldName && String(catData[i][2]) === String(user_id)) {
      catSheet.getRange(i + 1, 2).setValue(newName);
    }
  }
  
  // Update words sheet
  const wordSheet = ss.getSheetByName('words');
  const wordData = wordSheet.getDataRange().getValues();
  for (let i = 1; i < wordData.length; i++) {
    if (wordData[i][8] === oldName && String(wordData[i][10]) === String(user_id)) {
      wordSheet.getRange(i + 1, 9).setValue(newName);
    }
  }
  return { success: true };
}

// Action: deleteCategory
function deleteCategory(ss, name, user_id) {
  // Delete from categories sheet
  const catSheet = ss.getSheetByName('categories');
  const catData = catSheet.getDataRange().getValues();
  for (let i = 1; i < catData.length; i++) {
    if (catData[i][1] === name && String(catData[i][2]) === String(user_id)) {
      catSheet.deleteRow(i + 1);
      break; 
    }
  }
  
  // Move words to '未分類'
  const wordSheet = ss.getSheetByName('words');
  const wordData = wordSheet.getDataRange().getValues();
  for (let i = 1; i < wordData.length; i++) {
    if (wordData[i][8] === name && String(wordData[i][10]) === String(user_id)) {
      wordSheet.getRange(i + 1, 9).setValue('未分類');
    }
  }
  return { success: true };
}
