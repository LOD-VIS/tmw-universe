<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:gnd="http://www.loc.gov/zing/srw/"
	xmlns:skos="http://www.w3.org/2004/02/skos/core#"
	xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
	xmlns:owl="http://www.w3.org/2002/07/owl#"
	xmlns:bibo="http://purl.org/ontology/bibo/"
	xmlns:umbel="http://umbel.org/umbel#"
	xmlns:lib="http://purl.org/library/"
	xmlns:marcrole="http://id.loc.gov/vocabulary/relators/"
	xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
	xmlns:dcterms="http://purl.org/dc/terms/"
	xmlns:gndo="http://d-nb.info/standards/elementset/gnd#"
	xmlns:isbd="http://iflastandards.info/ns/isbd/elements/"
	xmlns:sf="http://www.opengis.net/ont/sf#"
	xmlns:foaf="http://xmlns.com/foaf/0.1/"
	xmlns:rda="http://rdvocab.info/"
	xmlns:geo="http://www.opengis.net/ont/geosparql#"
	xmlns:dc="http://purl.org/dc/elements/1.1/">

  <xsl:template match="/">
  	<xsl:if test="//gnd:numberOfRecords &gt; 0">
			<div class="title"><xsl:value-of select="gndTitle"/> - <xsl:value-of select="//gnd:numberOfRecords"/> Treffer</div>
			<div class="block">
				<table class="list">
					<th>Name</th>
					<th>Beruf</th>
					<th>andere Namen</th>
					<th>GND-Link</th>
					
					<xsl:apply-templates select="//gnd:record"/>
				</table>
			</div>
		</xsl:if>
  </xsl:template>


	<xsl:template match="gnd:record">
		<tr>
			<td><xsl:value-of select="descendant-or-self::gndo:preferredNameForThePerson"/></td>
			<td><xsl:value-of select="descendant-or-self::gndo:preferredNameForTheSubjectHeading"/></td>
			<td><xsl:apply-templates select="descendant-or-self::gndo:variantNameForThePerson"/></td>
			<td>
				<a target="_blank">
					<xsl:attribute name="href">
						<xsl:value-of select="descendant-or-self::rdf:Description/@rdf:about"/>
					</xsl:attribute>
					<span><xsl:value-of select="descendant-or-self::rdf:Description/@rdf:about"/></span>
				</a>
			</td>
		</tr>
	</xsl:template>


	<xsl:template match="gndo:variantNameForThePerson">
		<xsl:if test="position() &gt; 1">
			<xsl:text>; </xsl:text>
		</xsl:if>

		<xsl:value-of select="."/>
	</xsl:template>
</xsl:stylesheet>
