<html>
<head>
	<title>OLD-Tool</title>
	<meta http-equiv="content-type" content="text/html; charset=utf-8">
	<link href="lod.css" type="text/css" rel="stylesheet">
</head>

<body>
<h3>Open-Linked-Data Searching-Tool</h3>
<p>wikipedia, watch-wiki.org, camera-wiki.org, genomaes.org, dnb.de</p>

<?PHP
include_once("easyrdf-0.8.0/lib/EasyRdf.php");
include_once("plugin/dnb/dnb.php");
include_once("plugin/geonames/geonames.php");
include_once("plugin/mediawiki/mediawiki.php");

if(isset($_GET['searchString'])) $searchString = $_GET['searchString'];
else $searchString="";

if(isset($_GET['button'])) $action = $_GET['button'];
else $action="";



echo "<form method='GET' action='index.php'>";
	echo "Suchbegriff <input type='text' name='searchString' value='".rawurldecode($searchString)."'><br>";
	echo "<input type='submit' name='button' value='suchen'>";
	echo "&nbsp;<input type='submit' name='button' value='reset'>";
echo "</form>";


if ($action == "suchen") {

// retrieve wikipedia
	$wiki = new Mediawiki("Wikipedia","http://de.wikipedia.org","/wiki/","/w/api.php");
	echo $wiki->query($searchString);


// retrieve watch-wiki
	$wiki = new Mediawiki("Watch-Wiki","http://www.watch-wiki.org","/index.php?title=","/api.php");
	echo $wiki->query($searchString);


// retrieve camera-wiki
	$wiki = new Mediawiki("Camera-Wiki","http://www.camera-wiki.org","/wiki/","/api.php");
	echo $wiki->query($searchString);


// retrieve geonames
	$geonames = new Geonames("adlibtmw");
	echo $geonames->query($searchString);


// retrieve dnb
// person
	$dnb = new DNB("GND Personen","40e9ad5201493592c1954fce966d32f","person");
	echo $dnb->query($searchString);

// institution
	$dnb = new DNB("GND Institutionen","40e9ad5201493592c1954fce966d32f","institution");
	echo $dnb->query($searchString);

// geography
	$dnb = new DNB("GND Geografie","40e9ad5201493592c1954fce966d32f","geography");
	echo $dnb->query($searchString);
}

?>

</body>
</html>
