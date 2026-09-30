<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <xsl:template match="/">
  	<xsl:if test="count(//geoname) &gt; 0">
			<div class="title">Geonames</div>
			<div class="block">
				<table class="list">
					<th>Score</th>
					<th>Name</th>
					<th>Land</th>
					<th colspan="2">Koordinaten</th>
					<th>Einwohner</th>
					<th>Geoname ID</th>

					<xsl:apply-templates select="//geoname"/>
				</table>
			</div>
		</xsl:if>
  </xsl:template>

  <xsl:template match="geoname">
    <tr>
      <td><xsl:copy-of select="round(score)"/></td>

      <td><xsl:value-of select="toponymName"/>
	<xsl:if test="toponymName != name">
	  <xsl:text> (</xsl:text>
	  <xsl:value-of select="name"/>
	  <xsl:text>)</xsl:text>
	 </xsl:if>
      </td>
      <td><xsl:value-of select="countryName"/></td>
      <td><xsl:value-of select="lat"/></td><td><xsl:value-of select="lng"/></td>
      <td><xsl:value-of select="population"/></td>

      <td>
				<a class="strong" target="_blank">
					<xsl:attribute name="href">
						<xsl:text>http://www.geonames.org/</xsl:text>
						<xsl:value-of select="geonameId"/>
					</xsl:attribute>
					<xsl:value-of select="geonameId"/>
				 </a>
      </td>
<!--      <td><xsl:copy-of select="."/></td>-->
    </tr>
  </xsl:template>
</xsl:stylesheet>
