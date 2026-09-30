<?PHP
// DNB-Datenservice parser

class Geonames {
	var $url;
	var $user;
	var $xslPath;
	var $style;

	function __construct($user="") {
		$this->url = "http://api.geonames.org/search";
		$this->xsl = "";

		$this->user;

		if ($user) {
			$this->user = $user;
			return true;
		}
		else
			return false;
	}

	function query($searchString) {
		$this->style = "full";
		$this->xslPath = "plugin/geonames/geonames.xslt";

		$path = "{$this->url}?username={$this->user}&q={$searchString}&style={$this->style}";
//echo $path;
		$xmlString = file_get_contents($path);

		$xsl = new DOMDocument;
		$xsl->load($this->xslPath);

		$xml = new DOMDocument("1.0","UTF-8");
		$xml->loadXML($xmlString);

		return $this->parse($xml,$xsl);
	}

	function parse($xml,$xsl) {
	  $proc = new XSLTProcessor;
	  $proc->importStyleSheet($xsl);
	  
	  return $proc->transformToXML($xml);
	}
}

?>

