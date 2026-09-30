<?PHP
// Mediawiki-parser

class Mediawiki {
	var $title;
	var $url;
	var $retrievePath;
	var $apiPath;
	var $user;
	var $xslPath;
	var $style;
	var $param;

// $title ... title of the wiki
// $url ... path to wiki page
// $retrievePath ... subpath for page retrieval
// $apiPath ... subpath to api
	function __construct($title,$url,$retrievePath,$apiPath) {
		$this->title = $title;
		$this->url = $url;
		$this->retrievePath = $retrievePath;
		$this->apiPath = $apiPath;
		$this->xsl = "";
		$this->param = array(
			"format=xml",
			"list=exturlusage",
			"action=query",
			"prop=info|links|iwlinks|extlinks|categories|extracts",
			"exsentences=3",
			"explaintext",
			"siprop=general"
		);
	}

	function query($searchString) {
		$this->xslPath = "plugin/mediawiki/mediawiki.xslt";

		$path = "{$this->url}{$this->apiPath}?".implode($this->param,"&")."&titles=".rawurlencode($searchString);
//echo $path."<br>";
		$xmlString = file_get_contents($path);

		$xsl = new DOMDocument;
		$xsl->load($this->xslPath);

		$xml = new DOMDocument("1.0","UTF-8");
		$xml->loadXML($xmlString);

// add title to result
		$urlNode = new DOMElement("wikiTitle",$this->title);
		$xml->appendChild($urlNode);

// add url to result
		$urlNode = new DOMElement("wikiURL",$this->url.$this->retrievePath);
		$xml->appendChild($urlNode);

		return $this->parse($xml,$xsl);
	}

	function parse($xml,$xsl) {
	  $proc = new XSLTProcessor;
	  $proc->importStyleSheet($xsl);
	  
	  return $proc->transformToXML($xml);
	}
}

?>

