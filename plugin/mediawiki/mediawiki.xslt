<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <xsl:template match="/">
<!--<xsl:value-of select="."/>-->

		<xsl:if test="count(//@missing) != count(//page)">
			<div class='title'><xsl:value-of select="//wikiTitle"/></div>
			<div class='block'>
				<xsl:apply-templates select="//page"/>

				<xsl:if test="//el">
					<div class="links">Externe links</div>
					<xsl:apply-templates select="//el"/>
				</xsl:if>

			</div>
		</xsl:if>
  </xsl:template>


  <xsl:template match="page">
		<xsl:if test="not(@missing)">
			<a target="_blank">
				<xsl:attribute name="href">
					<xsl:value-of select="//wikiURL"/>
					<xsl:value-of select="@title"/>
				</xsl:attribute>

				<xsl:value-of select="@title"/>
			</a>

			<xsl:if test="extract">
				<xsl:text> </xsl:text><span class="summary"><xsl:value-of select="extract"/></span>
			</xsl:if>
		</xsl:if>
  </xsl:template>


  <xsl:template match="el">
		<xsl:variable name="url" select="."/>

		<a class="link" target="_blank">
			<xsl:attribute name="href">
				<xsl:if test="substring($url,1,4) != 'http'">
					<xsl:text>http:</xsl:text>
				</xsl:if>
				<xsl:value-of select="."/>
			</xsl:attribute>
			<xsl:value-of select="."/>
		</a>
  </xsl:template>

  <xsl:template match="eu">
		<xsl:variable name="url" select="@url"/>

		<a class="link" target="_blank">
			<xsl:attribute name="href">
				<xsl:if test="substring($url,1,4) != 'http'">
					<xsl:text>http:</xsl:text>
				</xsl:if>

				<xsl:value-of select="$url"/>
			</xsl:attribute>
			<xsl:value-of select="@title"/>
		</a>
  </xsl:template>
</xsl:stylesheet>
