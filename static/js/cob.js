/* ------------------------------
      General State Variables
------------------------------ */
// Shortcuts to current graph parameters
var curNetwork = '';
var curOntology = '';
var curTerm = '';
var curOpts = {};

// Shortcut to current cytoscape object
var cy = null;

// Save of all node objects returned for qucker graph manipulation
var geneDict = null;

// Returns whether or not the current graph uses the Polywas layout
var isPoly = function(){return cy.options().layout.name === 'polywas';}

// Saves whether data is a term or a custom network
var isTerm = false;

// Holder for the timer id of the subnet pop effect
var popTimerID = 1;

// Track genes that are selected for persistence
var curSel = [];

// Track whether an addGenes request is already in process
var noAdd = false;

// Places to hold needed information to revert from subnet graphs
var pastGeneDicts = [];
var pastPoly = [];
var pastQuery = [];

/* ----------------------------
      Enrichment Variables
---------------------------- */
// List of genes that were queried for enrichment, Used for parameter updating
var enrichGenes = null;

// Saves whether there is currently a GO request pending
var noGO = false;

// Saves whether enrichment is GO or GWS
var isGO = true;

/* ----------------------------
      Option Variables
---------------------------- */
// Store state of logSpacingButton
var logSpacingDefault = true;
var logSpacing = logSpacingDefault;

// FDR state variables, flag is to indicate need to reload
var fdrFilterDefault = true;
var fdrFilter = fdrFilterDefault;
var fdrFlag = false;

// Dictionary containing metadata for all of the parameters
var optVals = {
  'nodeCutoff':{'title':'Min Node Degree',
    'default':1,'min':0,'max':20,'int':true},
  'edgeCutoff':{'title':'Min Edge Score',
    'default':3.0,'min':1.0,'max':20.0,'int':false},
  'fdrCutoff':{'title':'FDR Filter (Term)',
    'default':0.35,'min':0.0,'max':5.0,'int':false},
  'windowSize':{'title':'Window Size (Term)',
    'default':50000,'min':0,'max':1000000,'int':true},
  'flankLimit':{'title':'Flank Limit (Term)',
    'default':2,'min':0,'max':20,'int':true},
  'visNeighbors':{'title':'Vis Neighbors (Custom)',
    'default':25,'min':0,'max':150,'int':true},
  'nodeSize':{'title':'Gene Size',
    'default':10,'min':5,'max':50,'int':true},
  'snpLevels':{'title':'SNP Colors (Polywas)',
    'default':3,'min':1,'max':10,'int':true},
  'pCutoff':{'title':'Probability Cutoff',
    'default':0.05,'min':0.0,'max':1.0,'int':false},
  'minTerm':{'title':'Min Genes (GO)',
    'default':5,'min':1,'max':99,'int':true},
  'maxTerm':{'title':'Max Genes (GO)',
    'default':300,'min':100,'max':1000,'int':true},
};

/*-----------------------------------------------
              Initialization
-----------------------------------------------*/
// Pull all of the code for the general page
$.getScript($SCRIPT_ROOT + 'static/js/core.js');
$.getScript($SCRIPT_ROOT + 'static/js/genes.js');
$.getScript($SCRIPT_ROOT + 'static/js/graph.js');
$.getScript($SCRIPT_ROOT + 'static/js/polywas-layout.js');
$.getScript($SCRIPT_ROOT + 'static/js/enrichment.js');

// Execute some setup after loading tools
$.getScript(($SCRIPT_ROOT + 'static/js/tools.js'), function(){
  // Set the options
  restoreDefaults();
  updateOpts();
  
  // Setup the Heads Up Display
  updateHUD();
});

// Execute some setup after loading tables
$.getScript(($SCRIPT_ROOT + 'static/js/tables.js'), function(){
  // Make sure the table is visible
  $('#NetworkWait').addClass("hidden");
  $('#Network').removeClass("hidden");

  // Build some tables!
  buildNetworkTable();
});

/*-----------------------------------------------
      Gene Selection Tables Event Listeners
-----------------------------------------------*/
// A row on the Ontology Table is selected
$('#NetworkTable tbody').on('click','tr', function(){
  // Save the selected row
  curNetwork = $('td', this).eq(0).text();

  // Clean up the graph
  if(cy !== null){cy.destroy();cy = null;destroyGeneTables();}
  updateHUD();

  // Prep the Ontology Table
  curOntology = '';
  $('#GeneSelectWait').addClass("hidden");
  $('#GeneSelect').removeClass("hidden");

  // Clean up the Term Table
  curTerm = '';
  $('#Term').addClass('hidden');
  $('#TermWait').removeClass('hidden');
  
  // Fetch and build the next table
  buildOntologyTable(curNetwork);
  
  // Set up the text completion engine for the gene list
  setupTextComplete(curNetwork, '#geneList');
  
  // Clean out the FDR Options
  updateFDR();
});

// A row on the Term Table is selected
$('#OntologyTable tbody').on('click','tr', function(){
  if($('#OntologyTable').DataTable().rows().count() < 1){return;}
  
  // Highlight the relevant row
  curOntology = $('td',this).eq(0).text();

  // Clean up the graph
  if(cy !== null){cy.destroy();cy = null;destroyGeneTables();}
  updateHUD();

  // Prep the Term Table
  curTerm = '';
  $('#TermWait').addClass("hidden");
  $('#Term').removeClass("hidden");

  // Fetch and build the network table
  buildTermTable(curOntology);
  
  // Set up the FDR Opts
  updateFDR();
});

// A row on the Network Table is selected
$('#TermTable tbody').on('click','tr',function(){
    // Highlight the last line
    curTerm = $('td',this).eq(0).text();

    // Get the new Graph
    loadGraph(true,true,true);
});

/*----------------------------------------------
     Gene Selection Button Event Listeners
----------------------------------------------*/
// Build graph button is clicked
$("#TermGenesButton").click(function(){
  if($('#geneList').val().length > 1){
    curOntology = '';
    updateFDR();
    loadGraph(true,false,false);}
  else{window.alert('You need to enter at least one gene.');}
});

/*------------------------------------------
     Parameter Update Event Listeners
------------------------------------------*/
// Do things when FDR enabled or diabled
$('#fdrButton').click(function(){
  fdrFilter = !(fdrFilter);
  fdrFlag = true;
  if(fdrFilter){$('.fdr-toggle').removeAttr('disabled');}
  else{$('.fdr-toggle').attr('disabled','disabled');}
});

// Toggle for Log Spacing in Polywas is pressed
$('#logSpacingButton').click(function(){
  logSpacing = !(logSpacing);
});

// Reset all the options on the options tab
$('#resetOptsButton').click(function(){
  $('.alert').addClass('hidden');
  restoreDefaults();
});

// Update Button on Options Tab is pressed 
$('#reEnrichButton').click(function(){
  if(enrichGenes !== null){enrich(enrichGenes,isGO);}
});

// Update Button on Options Tab is pressed 
$('#reGraphButton').click(function(){
  updateGraph();
});

// Enter is pressed in an option field
$("#opts").keypress(function(evt){
  if(evt.which !== 13){return;}
  evt.preventDefault();
  if(['pCutoff','minTerm','maxTerm'].indexOf(evt.target.id) > -1){
    if(enrichGenes !== null){enrich(enrichGenes,isGO);}
  }
  else{updateGraph();}
});

/*----------------------------------
        Table Tab Listeners
-----------------------------------*/
// Redraw the Subnet Table when shown
$('#navTabs a[href="#SubnetTab"]').on('shown.bs.tab', function(){
  if($.fn.DataTable.isDataTable('#SubnetTable')){$('#SubnetTable').DataTable().draw();}
});

/*--------------------------------------
        Graph Button Listeners
--------------------------------------*/
// Last graph button is pressed
$('#backButton').click(function(){
  restoreGraph();
});

// Toggle Layout button is pressed
$('#toggleLayoutButton').click(function(){
  if(cy === null){return;}
  
  // Save the selected genes
  $('#GeneTable').DataTable().rows('.selected').ids(true).each(function(cur){
    curSel.push(cur);
  });
  
  // Find the edge data objects from the current graph
  var edgeList = [];
  cy.edges(':visible').forEach(function(cur, idx, arr){
    var dataDict = cur.data();
    edgeList.push({'data':dataDict});
  });
  
  // Update the graph with the new layout
  loadGraph(true,(!isPoly()),undefined,geneDict,edgeList);
});

// Clear Selection Button is pressed
$('#clearSelectionButton').click(function(){
  if(cy === null){return;}
  
  // Remove the classes that highlight nodes
  cy.nodes('.highlighted').toggleClass('highlighted', false)
  cy.nodes('.neighbor').toggleClass('neighbor', false);
  cy.edges('.highlightedEdge').toggleClass('highlightedEdge', false);
  
  // Unhighlight the gene table
  $('#GeneTable').DataTable().rows().deselect();
  
  // Clear the subnetwork table
  $('#SubnetTable').DataTable().clear().draw();
});

/*--------------------------------------
        Export Button Listeners
--------------------------------------*/
// PNG Button is pressed
$('#pngButton').click(function(){
  if(cy === null){return;}
  var png = cy.png({bg:'white',scale:3});
  
  // Derive Filename
  var name = curNetwork + '.'
  if(isTerm){name += curTerm;}else{name += 'Custom';}
  
  // Run the Download
  download(png, (name+'.png'), 'image/png');
});

// GraphML Button is pressed
$('#graphMLButton').click(function(){
  if(cy === null){return;}
  
  // Get the graph
  var txt = cy.graphml();
  
  // Remove Chromosomes and SNP Groups
  doc = $.parseXML(txt);
  $(doc).find('[id^="SNPG"], node:contains("chrom")').remove();
  txt = (new XMLSerializer()).serializeToString(doc);
  
  // Derive Filename
  var name = curNetwork + '.'
  if(isTerm){name += curTerm;}else{name += 'Custom';}
  
  // Run the Download
  download(txt, (name+'.graphml'), 'application/xml');
});

