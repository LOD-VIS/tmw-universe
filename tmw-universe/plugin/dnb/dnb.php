<?PHP
// DNB-Datenservice parser

class DNB {
	var $url;
	var $title;
	var $domainName;
	var $version;
	var $operation;
	var $recordSchema;

	var $query;
	var $accessToken;
	var $domain = array();
	
	var $xslPath;

	function __construct($title="",$accessToken = "",$domainName="") {
		$this->domainName = $domainName;
		if (!$domainName) $this->domainName = "person";

		$this->title = $title;
		$this->url = "http://services.dnb.de/sru/authorities";
		$this->version = "1.1";
		$this->operation = "searchRetrieve";
		$this->recordSchema = "RDFxml";

		$this->domain["person"] = "BBG%3DTp*"; // persons
		$this->domain["institution"] = "BBG%3DTb*"; // körperschaft
		$this->domain["geography"] = "BBG%3DTg*"; // geography
		
		$this->xslPath["person"] = "plugin/dnb/dnb_person.xslt";
		$this->xslPath["institution"] = "plugin/dnb/dnb_institution.xslt";
		$this->xslPath["geography"] = "plugin/dnb/dnb_geography.xslt";

		$this->accessToken;

		if ($accessToken) {
			$this->accessToken = $accessToken;
			return true;
		}
		else
			return false;
	}

	function query($searchString) {
		$searchString = str_replace(" ","%20",$searchString);

		$path = "{$this->url}?version={$this->version}&operation={$this->operation}&recordSchema={$this->recordSchema}&accessToken={$this->accessToken}&query={$searchString}%20and%20{$this->domain[$this->domainName]}";

		$xsl = new DOMDocument;
		$xsl->load($this->xslPath[$this->domainName]);

		$xmlString = file_get_contents($path);
		$xml = new DOMDocument("1.0","UTF-8");
		$xml->loadXML($xmlString);


// add title to result
		$urlNode = new DOMElement("gndTitle",$this->title);
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

