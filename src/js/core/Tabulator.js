'use strict';

import defaultOptions from './defaults/options.js';

import ColumnManager from './ColumnManager.js';
import RowManager from './RowManager.js';
import FooterManager from './FooterManager.js';

import InteractionMonitor from './tools/InteractionMonitor.js';
import ComponentFunctionBinder from './tools/ComponentFunctionBinder.js';
import DataLoader from './tools/DataLoader.js';

import ExternalEventBus from './tools/ExternalEventBus.js';
import InternalEventBus from './tools/InternalEventBus.js';

import TableRegistry from './tools/TableRegistry.js';
import ModuleBinder from './tools/ModuleBinder.js';

import OptionsList from './tools/OptionsList.js';

class Tabulator {

	constructor(element, options){

		this.options = {};

		this.columnManager = null; // hold Column Manager
		this.rowManager = null; //hold Row Manager
		this.footerManager = null; //holder Footer Manager
		this.vdomHoz  = null; //holder horizontal virtual dom
		this.externalEvents = null; //handle external event messaging
		this.eventBus = null; //handle internal event messaging
		this.interactionMonitor = false; //track user interaction
		this.browser = ""; //hold current browser type
		this.browserSlow = false; //handle reduced functionality for slower browsers
		this.browserMobile = false; //check if running on mobile, prevent resize cancelling edit on keyboard appearance
		this.rtl = false; //check if the table is in RTL mode
		this.originalElement = null; //hold original table element if it has been replaced

		this.componentFunctionBinder = new ComponentFunctionBinder(this); //bind component functions
		this.dataLoader = false; //bind component functions

		this.modules = {}; //hold all modules bound to this table
		this.modulesCore = {}; //hold core modules bound to this table (for initialization purposes)
		this.modulesRegular = {}; //hold regular modules bound to this table (for initialization purposes)

		this.optionsList = new OptionsList(this, "table constructor");

		this.initialized = false;

		if(this.initializeElement(element)){

			this.initialzeCoreSystems(options);

			//delay table creation to allow event bindings immediately after the constructor
			setTimeout(() => {
				this._create();
			})
		}

		TableRegistry.register(this); //register table for inter-device communication
	}

	initializeElement(element){
		if(typeof HTMLElement !== "undefined" && element instanceof HTMLElement){
			this.element = element;
			return true;
		}else if(typeof element === "string"){
			this.element = document.querySelector(element);

			if(this.element){
				return true;
			}else{
				console.error("Tabulator Creation Error - no element found matching selector: ", element);
				return false;
			}
		}else{
			console.error("Tabulator Creation Error - Invalid element provided:", element);
			return false;
		}
	}

	initialzeCoreSystems(options){
		this.columnManager = new ColumnManager(this);
		this.rowManager = new RowManager(this);
		this.footerManager = new FooterManager(this);
		this.dataLoader = new DataLoader(this);

		this.bindModules();

		this.options = this.optionsList.generate(Tabulator.defaultOptions, options)

		this._clearObjectPointers();

		this._mapDeprecatedFunctionality();

		this.externalEvents = new ExternalEventBus(this, this.options, this.options.debugEventsExternal);
		this.eventBus = new InternalEventBus(this.options.debugEventsInternal);

		this.interactionMonitor = new InteractionMonitor(this);

		this.dataLoader.initialize();
		this.columnManager.initialize();
		this.rowManager.initialize();
		this.footerManager.initialize();
	}

	//convert deprecated functionality to new functions
	_mapDeprecatedFunctionality(){
		//all previously deprecated functionality removed in the 5.0 release
	}

	_clearSelection(){

		this.element.classList.add("tabulator-block-select");

		if (window.getSelection) {
		  if (window.getSelection().empty) {  // Chrome
		  	window.getSelection().empty();
		  } else if (window.getSelection().removeAllRanges) {  // Firefox
		  	window.getSelection().removeAllRanges();
		  }
		} else if (document.selection) {  // IE?
			document.selection.empty();
		}

		this.element.classList.remove("tabulator-block-select");
	}

	//create table
	_create(){
		this.externalEvents.dispatch("tableBuilding");
		this.eventBus.dispatch("table-building");

		this._rtlCheck();

		this._buildElement();

		this._initializeTable();

		this._loadInitialData();

		this.initialized = true;

		this.externalEvents.dispatch("tableBuilt");
	}

	_rtlCheck(){
		var style = window.getComputedStyle(this.element);

		switch(this.options.textDirection){
			case"auto":
			if(style.direction !== "rtl"){
				break;
			};

			case "rtl":
			this.element.classList.add("tabulator-rtl");
			this.rtl = true;
			break;

			case "ltr":
			this.element.classList.add("tabulator-ltr");

			default:
			this.rtl = false;
		}
	}

	//clear pointers to objects in default config object
	_clearObjectPointers(){
		this.options.columns = this.options.columns.slice(0);

		if(this.options.data && !this.options.reactiveData){
			this.options.data = this.options.data.slice(0);
		}
	}

	//build tabulator element
	_buildElement(){
		var element = this.element,
		options = this.options,
		newElement;

		if(element.tagName === "TABLE"){
			this.originalElement = this.element;
			newElement = document.createElement("div");

			//transfer attributes to new element
			var attributes = element.attributes;

			// loop through attributes and apply them on div
			for(var i in attributes){
				if(typeof attributes[i] == "object"){
					newElement.setAttribute(attributes[i].name, attributes[i].value);
				}
			}

			// replace table with div element
			element.parentNode.replaceChild(newElement, element);

			this.element = element = newElement;
		}

		element.classList.add("tabulator");
		element.setAttribute("role", "grid");

		//empty element
		while(element.firstChild) element.removeChild(element.firstChild);

		//set table height
		if(options.height){
			options.height = isNaN(options.height) ? options.height : options.height + "px";
			element.style.height = options.height;
		}

		//set table min height
		if(options.minHeight !== false){
			options.minHeight = isNaN(options.minHeight) ? options.minHeight : options.minHeight + "px";
			element.style.minHeight = options.minHeight;
		}

		//set table maxHeight
		if(options.maxHeight !== false){
			options.maxHeight = isNaN(options.maxHeight) ? options.maxHeight : options.maxHeight + "px";
			element.style.maxHeight = options.maxHeight;
		}
	}

	//initialize core systems and modules
	_initializeTable(){
		var element = this.element,
		options = this.options;

		this.interactionMonitor.initialize();

		this.columnManager.initialize();
		this.rowManager.initialize();

		this._detectBrowser();

		//initialize core modules
		for (let key in this.modulesCore){
			let mod = this.modulesCore[key];

			mod.initialize();
		}

		//configure placeholder element
		if(typeof options.placeholder == "string"){
			var el = document.createElement("div");
			el.classList.add("tabulator-placeholder");

			var span = document.createElement("span");
			span.innerHTML = options.placeholder;

			el.appendChild(span);

			options.placeholder = el;
		}

		//build table elements
		element.appendChild(this.columnManager.getElement());
		element.appendChild(this.rowManager.getElement());

		if(options.footerElement){
			this.footerManager.activate();
		}

		if(options.autoColumns && options.data){

			this.columnManager.generateColumnsFromRowData(this.options.data);
		}

		//initialize regular modules
		for (let key in this.modulesRegular){
			let mod = this.modulesRegular[key];

			mod.initialize();
		}

		this.columnManager.setColumns(options.columns);

		this.eventBus.dispatch("table-built");
	}

	_loadInitialData(){
		this.dataLoader.load(this.options.data);
	}

	//deconstructor
	destroy(){
		var element = this.element;

		TableRegistry.deregister(this); //deregister table from inter-device communication

		this.eventBus.dispatch("table-destroy");

		//clear row data
		this.rowManager.rows.forEach(function(row){
			row.wipe();
		});

		this.rowManager.rows = [];
		this.rowManager.activeRows = [];
		this.rowManager.displayRows = [];

		//clear DOM
		while(element.firstChild) element.removeChild(element.firstChild);
		element.classList.remove("tabulator");
	}

	_detectBrowser(){
		var ua = navigator.userAgent||navigator.vendor||window.opera;

		if(ua.indexOf("Trident") > -1){
			this.browser = "ie";
			this.browserSlow = true;
		}else if(ua.indexOf("Edge") > -1){
			this.browser = "edge";
			this.browserSlow = true;
		}else if(ua.indexOf("Firefox") > -1){
			this.browser = "firefox";
			this.browserSlow = false;
		}else{
			this.browser = "other";
			this.browserSlow = false;
		}

		this.browserMobile = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(ua)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(ua.substr(0,4));
	}

	////////////////// Data Handling //////////////////
	//block table redrawing
	blockRedraw(){
		return this.rowManager.blockRedraw();
	}

	//restore table redrawing
	restoreRedraw(){
		return this.rowManager.restoreRedraw();
	}

	//load data
	setData(data, params, config){
		if(this.initialized){
			return this.dataLoader.load(data, params, config, false);
		}else{
			console.warn("setData failed - table not yet initialized. To set initial data please use the 'data' property in the table constructor.")
		}
	}

	//clear data
	clearData(){
		this.dataLoader.blockActiveLoad();
		this.rowManager.clearData();
	}

	//get table data array
	getData(active){
		return this.rowManager.getData(active);
	}

	//get table data array count
	getDataCount(active){
		return this.rowManager.getDataCount(active);
	}

	//replace data, keeping table in position with same sort
	replaceData(data, params, config){
		if(this.initialized){
			return this.dataLoader.load(data, params, config, true, true);
		}else{
			console.warn("replaceData failed - table not yet initialized. Please wait for the `tableBuilt` event before calling this function.");
		}
	}

	//update table data
	updateData(data){
		var responses = 0;

		if(this.initialized){
			return new Promise((resolve, reject) => {
				this.dataLoader.blockActiveLoad();

				if(typeof data === "string"){
					data = JSON.parse(data);
				}

				if(data){
					data.forEach((item) => {
						var row = this.rowManager.findRow(item[this.options.index]);

						if(row){
							responses++;

							row.updateData(item)
							.then(()=>{
								responses--;

								if(!responses){
									resolve();
								}
							});
						}
					});
				}else{
					console.warn("Update Error - No data provided");
					reject("Update Error - No data provided");
				}
			});
		}else{
			console.warn("updateData failed - table not yet initialized. Please wait for the `tableBuilt` event before calling this function.");
		}
	}

	addData(data, pos, index){
		if(this.initialized){
			return new Promise((resolve, reject) => {
				this.dataLoader.blockActiveLoad();

				if(typeof data === "string"){
					data = JSON.parse(data);
				}

				if(data){
					this.rowManager.addRows(data, pos, index)
					.then((rows) => {
						var output = [];

						rows.forEach(function(row){
							output.push(row.getComponent());
						});

						resolve(output);
					});
				}else{
					console.warn("Update Error - No data provided");
					reject("Update Error - No data provided");
				}
			});
		}else{
			console.warn("addData failed - table not yet initialized. Please wait for the `tableBuilt` event before calling this function.");
		}
	}

	//update table data
	updateOrAddData(data){
		var rows = [],
		responses = 0;

		if(this.initialized){
			return new Promise((resolve, reject) => {
				this.dataLoader.blockActiveLoad();

				if(typeof data === "string"){
					data = JSON.parse(data);
				}

				if(data){
					data.forEach((item) => {
						var row = this.rowManager.findRow(item[this.options.index]);

						responses++;

						if(row){
							row.updateData(item)
							.then(()=>{
								responses--;
								rows.push(row.getComponent());

								if(!responses){
									resolve(rows);
								}
							});
						}else{
							this.rowManager.addRows(item)
							.then((newRows)=>{
								responses--;
								rows.push(newRows[0].getComponent());

								if(!responses){
									resolve(rows);
								}
							});
						}
					});
				}else{
					console.warn("Update Error - No data provided");
					reject("Update Error - No data provided");
				}
			});
		}else{
			console.warn("updateOrAddData failed - table not yet initialized. Please wait for the `tableBuilt` event before calling this function.");
		}
	}

	//get row object
	getRow(index){
		var row = this.rowManager.findRow(index);

		if(row){
			return row.getComponent();
		}else{
			console.warn("Find Error - No matching row found:", index);
			return false;
		}
	}

	//get row object
	getRowFromPosition(position, active){
		var row = this.rowManager.getRowFromPosition(position, active);

		if(row){
			return row.getComponent();
		}else{
			console.warn("Find Error - No matching row found:", position);
			return false;
		}
	}

	//delete row from table
	deleteRow(index){
		var foundRows = [];

		if(!Array.isArray(index)){
			index = [index];
		}

		//find matching rows
		for(let item of index){
			let row = this.rowManager.findRow(item, true);

			if(row){
				foundRows.push(row);
			}else{
				console.error("Delete Error - No matching row found:", item);
				return Promise.reject("Delete Error - No matching row found")
				break;
			}
		}

		//sort rows into correct order to ensure smooth delete from table
		foundRows.sort((a, b) => {
			return this.rowManager.rows.indexOf(a) > this.rowManager.rows.indexOf(b) ? 1 : -1;
		});

		//delete rows
		foundRows.forEach((row) =>{
			row.delete()
		});

		this.rowManager.reRenderInPosition();

		return Promise.resolve();
	}

	//add row to table
	addRow(data, pos, index){
		if(this.initialized){
			if(typeof data === "string"){
				data = JSON.parse(data);
			}

			return this.rowManager.addRows(data, pos, index)
			.then((rows)=>{
				return rows[0].getComponent();
			});
		}else{
			console.warn("addRow failed - table not yet initialized. Please wait for the `tableBuilt` event before calling this function.");
		}
	}

	//update a row if it exitsts otherwise create it
	updateOrAddRow(index, data){
		var row = this.rowManager.findRow(index);

		if(typeof data === "string"){
			data = JSON.parse(data);
		}

		if(row){
			return row.updateData(data)
			.then(()=>{
				return row.getComponent();
			})
		}else{
			return this.rowManager.addRows(data)
			.then((rows)=>{
				return rows[0].getComponent();
			})
		}
	}

	//update row data
	updateRow(index, data){
		var row = this.rowManager.findRow(index);

		if(typeof data === "string"){
			data = JSON.parse(data);
		}

		if(row){
			return row.updateData(data)
			.then(()=>{
				return Promise.resolve(row.getComponent());
			})
		}else{
			console.warn("Update Error - No matching row found:", index);
			return Promise.reject("Update Error - No matching row found");
		}
	}

	//scroll to row in DOM
	scrollToRow(index, position, ifVisible){
		var row = this.rowManager.findRow(index);

		if(row){
			return this.rowManager.scrollToRow(row, position, ifVisible)
		}else{
			console.warn("Scroll Error - No matching row found:", index);
			return Promise.reject("Scroll Error - No matching row found");
		}
	}

	moveRow(from, to, after){
		var fromRow = this.rowManager.findRow(from);

		if(fromRow){
			fromRow.moveToRow(to, after);
		}else{
			console.warn("Move Error - No matching row found:", from);
		}
	}

	getRows(active){
		return this.rowManager.getComponents(active);
	}

	//get position of row in table
	getRowPosition(index, active){
		var row = this.rowManager.findRow(index);

		if(row){
			return this.rowManager.getRowPosition(row, active);
		}else{
			console.warn("Position Error - No matching row found:", index);
			return false;
		}
	}

	/////////////// Column Functions  ///////////////
	setColumns(definition){
		if(this.initialized){
			this.columnManager.setColumns(definition);
		}else{
			console.warn("setColumns failed - table not yet initialized. To set initial data please use the 'columns' property in the table constructor.")
		}
	}

	getColumns(structured){
		return this.columnManager.getComponents(structured);
	}

	getColumn(field){
		var col = this.columnManager.findColumn(field);

		if(col){
			return col.getComponent();
		}else{
			console.warn("Find Error - No matching column found:", field);
			return false;
		}
	}

	getColumnDefinitions(){
		return this.columnManager.getDefinitionTree();
	}

	showColumn(field){
		var column = this.columnManager.findColumn(field);

		if(column){
			column.show();
		}else{
			console.warn("Column Show Error - No matching column found:", field);
			return false;
		}
	}

	hideColumn(field){
		var column = this.columnManager.findColumn(field);

		if(column){
			column.hide();
		}else{
			console.warn("Column Hide Error - No matching column found:", field);
			return false;
		}
	}

	toggleColumn(field){
		var column = this.columnManager.findColumn(field);

		if(column){
			if(column.visible){
				column.hide();
			}else{
				column.show();
			}
		}else{
			console.warn("Column Visibility Toggle Error - No matching column found:", field);
			return false;
		}
	}

	addColumn(definition, before, field){
		var column = this.columnManager.findColumn(field);

		return this.columnManager.addColumn(definition, before, column)
		.then((column) => {
			return column.getComponent();
		});
	}

	deleteColumn(field){
		var column = this.columnManager.findColumn(field);

		if(column){
			return column.delete();
		}else{
			console.warn("Column Delete Error - No matching column found:", field);
			return Promise.reject();
		}
	}

	updateColumnDefinition(field, definition){
		var column = this.columnManager.findColumn(field);

		if(column){
			return column.updateDefinition(definition)
		}else{
			console.warn("Column Update Error - No matching column found:", field);
			return Promise.reject();
		}
	}

	moveColumn(from, to, after){
		var fromColumn = this.columnManager.findColumn(from);
		var toColumn = this.columnManager.findColumn(to);

		if(fromColumn){
			if(toColumn){
				this.columnManager.moveColumn(fromColumn, toColumn, after)
			}else{
				console.warn("Move Error - No matching column found:", toColumn);
			}
		}else{
			console.warn("Move Error - No matching column found:", from);
		}
	}

	//scroll to column in DOM
	scrollToColumn(field, position, ifVisible){
		return new Promise((resolve, reject) => {
			var column = this.columnManager.findColumn(field);

			if(column){
				return this.columnManager.scrollToColumn(column, position, ifVisible)
			}else{
				console.warn("Scroll Error - No matching column found:", field);
				return Promise.reject("Scroll Error - No matching column found");
			}
		});
	}

	//////////// General Public Functions ////////////
	//redraw list without updating data
	redraw(force){
		if(this.initialized){
			this.columnManager.redraw(force);
			this.rowManager.redraw(force);
		}else{
			console.warn("redraw failed - table not yet initialized. Please wait for the `tableBuilt` event before calling this function.");
		}
	}

	setHeight(height){
		this.options.height = isNaN(height) ? height : height + "px";
		this.element.style.height = this.options.height;
		this.rowManager.initializeRenderer();
		this.rowManager.redraw();
	}

	//////////////////// Event Bus ///////////////////

	on(key, callback){
		this.externalEvents.subscribe(key, callback);
	}

	off(key, callback){
		this.externalEvents.unsubscribe(key, callback);
	}

	dispatchEvent(){
		var args = Array.from(arguments),
		key = args.shift();

		this.externalEvents.dispatch(...arguments)
	}

	////////////// Extension Management //////////////
	modExists(plugin, required){
		if(this.modules[plugin]){
			return true;
		}else{
			if(required){
				console.error("Tabulator Module Not Installed: " + plugin);
			}
			return false;
		}
	}

	module(key){
		var mod = this.modules[key];

		if(!mod){
			console.error("Tabulator module not installed: " + key);
		}

		return mod;
	}
}

//default setup options
Tabulator.defaultOptions = defaultOptions;

//bind modules and static functionality
new ModuleBinder(Tabulator);

export default Tabulator;