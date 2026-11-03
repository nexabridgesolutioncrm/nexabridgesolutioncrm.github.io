/**
 * NexaBridge Sheets Studio for Google Sheets.
 * Install as a bound Apps Script project with the included appsscript.json manifest.
 * No static secret, private Supabase key or password is stored in the script.
 * Calls the verified-Google-OAuth Supabase Edge Function for your CRM organization.
 */
const NEXA_BRIDGE_URL =
  'https://eahoudfosrblcsbjgjoa.supabase.co/functions/v1/nexabridge-sheets-oauth';
const NEXA_PROP_SHEET = 'NEXA_BRIDGE_SHEET_ID';
const NEXA_PROP_TAB = 'NEXA_BRIDGE_TAB_NAME';
const NEXA_PROP_META = 'NEXA_BRIDGE_META_TAB';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('NexaBridge CRM')
    .addItem('Connect CRM spreadsheet', 'nexaConnect')
    .addItem('Pull CRM data into Google Sheets', 'nexaPull')
    .addItem('Push changed cells back to CRM', 'nexaPush')
    .addSeparator()
    .addItem('Connection information', 'nexaInfo')
    .addToUi();
}

function nexaCall_(action, payload) {
  const token = ScriptApp.getOAuthToken();
  const body = Object.assign({}, payload || {}, {action: action});
  const response = UrlFetchApp.fetch(NEXA_BRIDGE_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: {Authorization: 'Bearer ' + token},
    muteHttpExceptions: true
  });
  const parsed = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() >= 300)
    throw new Error(parsed.error || 'NexaBridge integration request rejected (' + response.getResponseCode() + ')');
  return parsed;
}

function nexaProps_() {
  const props = PropertiesService.getDocumentProperties();
  if (!props) throw new Error('This script must be bound to a Google spreadsheet.');
  return props;
}

function nexaConnect() {
  try {
    const response = nexaCall_('list');
    const sheets = response.sheets || [];
    if (!sheets.length)
      return SpreadsheetApp.getUi().alert('No CRM spreadsheets found. Create a sheet in NexaBridge Sheets Studio first.');
    const message = sheets.map(s => s.name + '\n' + s.id).join('\n\n').slice(0,4000);
    const input = SpreadsheetApp.getUi().prompt(
      'Connect to a NexaBridge spreadsheet',
      'Paste the ID from this list:\n\n' + message,
      SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
    );
    if (input.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK) return;
    const id = input.getResponseText().trim();
    const selected = sheets.find(s => s.id === id);
    if (!selected) throw new Error('Select an ID exactly as shown in the list.');
    nexaProps_().setProperty(NEXA_PROP_SHEET, id);
    SpreadsheetApp.getUi().alert('Connected to "' + selected.name + '". Choose Pull to make a safe Google Sheets copy.');
  } catch (error) {
    SpreadsheetApp.getUi().alert('Connection failed: ' + error.message +
      '\n\nSign in to Google using the same verified email as your NexaBridge CRM account.');
  }
}

function nexaConfig_() {
  const properties = nexaProps_();
  const sheetId = properties.getProperty(NEXA_PROP_SHEET);
  if (!sheetId) throw new Error('Choose NexaBridge CRM → Connect CRM spreadsheet first.');
  return {properties, sheetId};
}

function nexaMeta_(book, name) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  return sheet;
}

function nexaRaw_(value, formula) {
  if (formula) return String(formula);
  if (value instanceof Date)
    return Utilities.formatDate(value, 'Etc/UTC', 'yyyy-MM-dd');
  if (value === undefined || value === null) return '';
  return String(value);
}

function nexaPull() {
  const ui = SpreadsheetApp.getUi();
  try {
    const config = nexaConfig_();
    const data = nexaCall_('read', {sheetId: config.sheetId});
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const visibleName = ('NexaBridge - ' + data.sheet.name).slice(0,95).replace(/[\[\]*?/\\]/g,'_');
    const metaName = ('_NB_META_' + config.sheetId.replace(/-/g,'').slice(0,12)).slice(0,99);
    let target = book.getSheetByName(visibleName);
    if (target) {
      const choice = ui.alert(
        'Replace the linked Google tab?',
        'Pull will overwrite the "' + visibleName + '" tab. Existing CRM records will NOT be modified.',
        ui.ButtonSet.YES_NO
      );
      if (choice !== ui.Button.YES) return;
      target.clearContents();
    } else target = book.insertSheet(visibleName);

    const cells = data.cells || [];
    let maxRow = 1, maxCol = 1;
    cells.forEach(c => {
      const pair = /^([A-Z]+)([0-9]+)$/.exec(c.address);
      if (!pair) return;
      maxRow = Math.max(maxRow, Number(pair[2]));
      maxCol = Math.max(maxCol, nexaColumn_(pair[1]));
    });
    if (maxRow > 10000 || maxCol > 26) throw new Error('Workbook exceeds supported range A1:Z10000.');
    const grid = Array.from({length:maxRow}, () => Array(maxCol).fill(''));
    const baseline = [['address','revision','raw_value']];
    cells.forEach(c => {
      const pair = /^([A-Z]+)([0-9]+)$/.exec(c.address);
      if (!pair) return;
      const row = Number(pair[2])-1, col = nexaColumn_(pair[1])-1;
      // Treat imported formulas as text until the user explicitly enables execution in Google Sheets.
      // This prevents an untrusted CRM formula from becoming an executable IMPORTXML/IMPORTRANGE call.
      const raw = String(c.raw_value == null ? '' : c.raw_value);
      grid[row][col] = /^[=+@\t\r]/.test(raw) ? "'" + raw : raw;
      baseline.push([c.address, Number(c.revision)||0, raw]);
    });
    if (target.getMaxRows() < maxRow) target.insertRowsAfter(target.getMaxRows(),maxRow-target.getMaxRows());
    if (target.getMaxColumns() < maxCol) target.insertColumnsAfter(target.getMaxColumns(),maxCol-target.getMaxColumns());
    target.getRange(1,1,maxRow,maxCol).setNumberFormat('@').setValues(grid);
    const meta = nexaMeta_(book,metaName);
    meta.clearContents();
    if (meta.getMaxRows()<baseline.length) meta.insertRowsAfter(meta.getMaxRows(),baseline.length-meta.getMaxRows());
    meta.getRange(1,1,baseline.length,3).setNumberFormat('@').setValues(baseline);
    try{meta.hideSheet()}catch(e){}
    config.properties.setProperty(NEXA_PROP_TAB, visibleName);
    config.properties.setProperty(NEXA_PROP_META, metaName);
    book.setActiveSheet(target);
    ui.alert('Pulled ' + cells.length + ' CRM cells into "' + visibleName + '". Formulas were imported as text for safety.');
  } catch (error) {
    ui.alert('Pull failed: ' + error.message);
  }
}

function nexaColumn_(letters){
  return String(letters).split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
}

function nexaAddress_(row,col) {
  let result='',index=col;
  while(index>0){index--;result=String.fromCharCode(65+index%26)+result;index=Math.floor(index/26);}
  return result + row;
}

function nexaPush() {
  const ui = SpreadsheetApp.getUi();
  try {
    const config=nexaConfig_(),book=SpreadsheetApp.getActiveSpreadsheet();
    const linkedName=config.properties.getProperty(NEXA_PROP_TAB);
    const metaName=config.properties.getProperty(NEXA_PROP_META);
    const linked=book.getSheetByName(linkedName),meta=book.getSheetByName(metaName);
    if (!linked || !meta) throw new Error('Pull from CRM first to establish a revision-safe baseline.');
    if (book.getActiveSheet().getSheetId() !== linked.getSheetId())
      throw new Error('Select the linked tab "' + linkedName + '" first.');
    const baseRows=meta.getDataRange().getValues().slice(1),baseline=new Map();
    baseRows.forEach(r => {if(r[0])baseline.set(String(r[0]),{revision:Number(r[1])||0,raw:String(r[2]??'')});});
    const range=linked.getDataRange(),values=range.getValues(),formulas=range.getFormulas();
    if (values.length>10000 || values[0].length>26) throw new Error('Only A1:Z10000 is supported.');
    const modified=[];
    for(let row=0;row<values.length;row++)for(let col=0;col<values[row].length;col++){
      const address=nexaAddress_(row+1,col+1);
      const current=nexaRaw_(values[row][col],formulas[row][col]);
      const before=baseline.get(address)||{revision:0,raw:''};
      if (current!==before.raw && current.length<=4000)
        modified.push({address,value:current,revision:before.revision});
      else if(current.length>4000)throw new Error(address+' exceeds 4,000 characters');
    }
    if (!modified.length) return ui.alert('No changed cells to push. CRM was not modified.');
    if (modified.length>2000) throw new Error('Push at most 2,000 edited cells. Split large changes into batches.');
    const answer=ui.alert('Push changes to NexaBridge CRM?',
      'Save '+modified.length+' changed cells? Existing cells will only update when their revision matches the last Pull.',
      ui.ButtonSet.YES_NO);
    if(answer!==ui.Button.YES)return;
    let saved=0,conflicts=[];
    for(let i=0;i<modified.length;i+=100){
      const response=nexaCall_('write',{sheetId:config.sheetId,cells:modified.slice(i,i+100)});
      for(const result of response.results||[]){
        if(result.saved){
          saved++;
          const item=modified.find(c=>c.address===result.address);
          baseline.set(result.address,{revision:result.revision,raw:item.value});
        }else conflicts.push(result.address+': '+(result.error||'conflict'));
      }
    }
    const rows=[['address','revision','raw_value']];
    for(const [address,record] of baseline)rows.push([address,record.revision,record.raw]);
    meta.clearContents();
    if(meta.getMaxRows()<rows.length)meta.insertRowsAfter(meta.getMaxRows(),rows.length-meta.getMaxRows());
    meta.getRange(1,1,rows.length,3).setNumberFormat('@').setValues(rows);
    const message='Saved '+saved+' cell(s) to NexaBridge.'+(conflicts.length?
      '\nConflicts: '+conflicts.length+'. Pull a fresh copy before retrying.\n'+conflicts.slice(0,12).join('\n'):'');
    ui.alert(message);
  }catch(error){ui.alert('Push failed: '+error.message);}
}

function nexaInfo(){
  const props=nexaProps_();
  SpreadsheetApp.getUi().alert('NexaBridge Sheets Studio integration\nLinked sheet: '+
    (props.getProperty(NEXA_PROP_SHEET)||'(not connected)')+
    '\nGoogle tab: '+(props.getProperty(NEXA_PROP_TAB)||'(not pulled)')+
    '\n\nChanges are version-checked. Apps Script runs under your Google account and requires consent.');
}
