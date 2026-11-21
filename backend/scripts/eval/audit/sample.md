## Case 1

Question: Which data sources are used for wind energy potential assessment?

### Gold query

SELECT ?paper ?source_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C92000 ; orkgp:P112020 ?s . ?s rdfs:label ?source_label . }

### Gold result (head)

73 rows; columns: paper, source_label
paper=R706033 | source_label=Synoptic station
paper=R712275 | source_label=Synoptic station
paper=R712288 | source_label=Synoptic station
paper=R707456 | source_label=site
paper=R711419 | source_label=NASA satellite
paper=R711568 | source_label=NASA satellite
paper=R711507 | source_label=Airport
paper=R712559 | source_label=Airport
paper=R717710 | source_label=Airport
paper=R720760 | source_label=Airport
paper=R704994 | source_label=Airport
paper=R711460 | source_label=European centre for medium-range weather forecasts

### Predicted query

# id: data_sources_per_paper

# Declare the prefixes used in this query

# Select the paper, its title, and the data source label

SELECT ?paper ?paperLabel ?dataSourceLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions that are instances of the template contribution class

?contribution a orkgc:C92000 .

# Get the data source value from the contribution

?contribution orkgp:P112020 ?dataSource .

# Get the paper's human-readable title

?paper rdfs:label ?paperLabel .

# Optionally get the data source's label if it is a resource

OPTIONAL { ?dataSource rdfs:label ?dsLabel . }

# Use the label when available, otherwise fall back to the raw value

BIND(COALESCE(?dsLabel, STR(?dataSource)) AS ?dataSourceLabel)
}

# Order by paper so all data source rows for each paper are grouped together

ORDER BY ?paperLabel

### Predicted result (head)

73 rows; columns: paper, paperLabel, dataSourceLabel
paper=R705221 | paperLabel=A new approach to estimate the Weibull parameters for wind e | dataSourceLabel=wind turbine
paper=R727032 | paperLabel=A statistical investigation of wind characteristics and wind | dataSourceLabel=meteorological
paper=R703061 | paperLabel=A wind energy integration analysis using wind resource asses | dataSourceLabel=meteorological mast
paper=R712559 | paperLabel=Accuracy of eight probability distribution functions for mod | dataSourceLabel=Airport
paper=R703102 | paperLabel=An Assessment of Wind Energy Potential for the Three Topogra | dataSourceLabel=meteorological
paper=R703064 | paperLabel=An Investigation of Wind Turbine Characteristics and the Win | dataSourceLabel=meteorological
paper=R703003 | paperLabel=An analysis of wind energy potential and economic evaluation | dataSourceLabel=wind turbine
paper=R707478 | paperLabel=An analysis of wind power density derived from several wind | dataSourceLabel=meteorological
paper=R702336 | paperLabel=An assessment of wind energy potential as a power generation | dataSourceLabel=meteorological
paper=R705198 | paperLabel=An innovative estimation method regarding Weibull parameters | dataSourceLabel=meteorological
paper=R703099 | paperLabel=Analysis of Wind Speed Data and Annual Energy Potential at T | dataSourceLabel=meteorological
paper=R708241 | paperLabel=Analysis of some flexible families of distributions for esti | dataSourceLabel=meteorological

## Case 2

Question: How many distinct constructs does each paper study?

### Gold query

SELECT ?paper (COUNT(DISTINCT ?x) AS ?n_constructs) WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C115015 ; orkgp:P175094 ?x . } GROUP BY ?paper

### Gold result (head)

1311 rows; columns: paper, n_constructs
paper=R1423114 | n_constructs=6
paper=R1413191 | n_constructs=4
paper=R1422561 | n_constructs=3
paper=R1429831 | n_constructs=5
paper=R1425559 | n_constructs=5
paper=R1421414 | n_constructs=2
paper=R1430507 | n_constructs=5
paper=R1428193 | n_constructs=4
paper=R1421722 | n_constructs=1
paper=R1415567 | n_constructs=4
paper=R1414164 | n_constructs=5
paper=R1428103 | n_constructs=5

### Predicted query

SELECT DISTINCT ?paper ?paperLabel ?construct ?constructLabel WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C115015 .
?contribution orkgp:P175094 ?construct .
?paper rdfs:label ?paperLabel .
OPTIONAL { ?construct rdfs:label ?constructRawLabel . }
BIND(COALESCE(?constructRawLabel, ?construct) AS ?constructLabel)
}

### Predicted result (head)

5691 rows; columns: paper, paperLabel, construct, constructLabel
paper=R1416541 | paperLabel=Saintly fund managers cannot earn a license to make sinful i | construct=R1416535 | constructLabel=ethical consistency
paper=R1416541 | paperLabel=Saintly fund managers cannot earn a license to make sinful i | construct=R1416537 | constructLabel=hypocrisy perceptions
paper=R1416541 | paperLabel=Saintly fund managers cannot earn a license to make sinful i | construct=R1416539 | constructLabel=attitudes toward short vs. long positions
paper=R1416541 | paperLabel=Saintly fund managers cannot earn a license to make sinful i | construct=R1416531 | constructLabel=past manager moral behavior
paper=R1416541 | paperLabel=Saintly fund managers cannot earn a license to make sinful i | construct=R1416533 | constructLabel=manager military experience
paper=R1416562 | paperLabel=Normative responding on cognitive bias tasks: Some evidence | construct=R1416549 | constructLabel=cognitive biases
paper=R1416562 | paperLabel=Normative responding on cognitive bias tasks: Some evidence | construct=R1416552 | constructLabel=decision-making competence
paper=R1416562 | paperLabel=Normative responding on cognitive bias tasks: Some evidence | construct=R1416555 | constructLabel=numeracy
paper=R1416562 | paperLabel=Normative responding on cognitive bias tasks: Some evidence | construct=R1416556 | constructLabel=actively open-minded thinking
paper=R1416562 | paperLabel=Normative responding on cognitive bias tasks: Some evidence | construct=R1416558 | constructLabel=superstitious thinking
paper=R1416562 | paperLabel=Normative responding on cognitive bias tasks: Some evidence | construct=R1416560 | constructLabel=conspiracy beliefs
paper=R1416562 | paperLabel=Normative responding on cognitive bias tasks: Some evidence | construct=R1412539 | constructLabel=rationality

## Case 3

Question: In which geographical areas are studies on obesity conducted?

### Gold query

SELECT ?paper ?area_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C123091 ; orkgp:P134011 ?d ; orkgp:P135009 ?a . ?d rdfs:label ?dl . ?a rdfs:label ?area_label . FILTER(LCASE(STR(?dl)) = "obesity") }

### Gold result (head)

124 rows; columns: paper, area_label
paper=R1900089 | area_label=Taiwan
paper=R1900350 | area_label=United States
paper=R1900353 | area_label=China
paper=R1900356 | area_label=Spain
paper=R1900360 | area_label=United States
paper=R1900363 | area_label=United States
paper=R1900366 | area_label=United States
paper=R1900369 | area_label=United States
paper=R1900712 | area_label=South Korea
paper=R1900728 | area_label=Iran
paper=R1900743 | area_label=Denmark
paper=R1900749 | area_label=Europe (HELENA Study; 8 European countries)

### Predicted query

# id: obesity_geographical_areas

# Namespace prefixes for ORKG resources, classes, predicates, and standard RDF/RDFS vocabularies

# Select distinct papers, their titles, and the geographical areas where the studies were conducted

SELECT DISTINCT ?paper ?paperLabel ?geographicalAreaLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions that are instances of the Nutritional and Metabolic Diseases template class

?contribution a orkgc:C123091 .

# Get the paper's title label

?paper rdfs:label ?paperLabel .

# Get the disease name associated with the contribution

?contribution orkgp:P134011 ?disease .

# Get the label of the disease resource

?disease rdfs:label ?diseaseLabel .

# Keep only contributions whose disease label mentions obesity (case-insensitive)

FILTER(CONTAINS(LCASE(STR(?diseaseLabel)), LCASE("obesity")))

# Get the geographical area associated with the contribution

?contribution orkgp:P135009 ?geographicalArea .

# Get the label of the geographical area resource

?geographicalArea rdfs:label ?geographicalAreaLabel .
}
ORDER BY ?paperLabel ?geographicalAreaLabel

### Predicted result (head)

124 rows; columns: paper, paperLabel, geographicalAreaLabel
paper=R1909715 | paperLabel=A Low-Carbohydrate, Ketogenic Diet versus a Low-Fat Diet To | geographicalAreaLabel=United States
paper=R1900369 | paperLabel=A Moderate-Protein Diet Produces Sustained Weight Loss and L | geographicalAreaLabel=United States
paper=R1909703 | paperLabel=A Randomized Trial of a Low-Carbohydrate Diet for Obesity | geographicalAreaLabel=United States
paper=R1900363 | paperLabel=A Reduced Ratio of Dietary Carbohydrate to Protein Improves | geographicalAreaLabel=United States
paper=R1911161 | paperLabel=A diet rich in long chain omega-3 fatty acids modulates sati | geographicalAreaLabel=Spain
paper=R1900366 | paperLabel=A high-protein diet induces sustained reductions in appetite | geographicalAreaLabel=United States
paper=R1910170 | paperLabel=A hypocaloric diet enriched in legumes specifically mitigate | geographicalAreaLabel=Spain
paper=R1908442 | paperLabel=A pilot study on the relationship between zinc deficiency an | geographicalAreaLabel=Serbia
paper=R1911056 | paperLabel=Additive benefits of long-chain n-3 polyunsaturated fatty ac | geographicalAreaLabel=New Zealand
paper=R1900749 | paperLabel=Adherence to the Mediterranean diet in metabolically healthy | geographicalAreaLabel=Europe (HELENA Study; 8 European countries)
paper=R1911087 | paperLabel=Adipose Depletion and Apoptosis Induced by Trans‐10, Cis‐12 | geographicalAreaLabel=United States
paper=R1908458 | paperLabel=Adiposity in women and children from transition countries pr | geographicalAreaLabel=Morocco and India

## Case 4

Question: How is impulsivity measured across studies?

### Gold query

SELECT ?paper ?measure_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C115015 ; orkgp:P175094 ?x ; orkgp:P175095 ?m . ?x rdfs:label ?xl . ?m rdfs:label ?measure_label . FILTER(LCASE(STR(?xl)) = "impulsivity") }

### Gold result (head)

18 rows; columns: paper, measure_label
paper=R1416848 | measure_label=barratt impulsiveness scale
paper=R1419660 | measure_label=barratt impulsiveness scale - brief (bis-brief)
paper=R1419780 | measure_label=barratt impulsivity scale (bis-11)
paper=R1420362 | measure_label=barratt impulsivity scale (bis)
paper=R1420783 | measure_label=laboratory tasks (e.g., go-no go tasks, balloon analog risk
paper=R1422995 | measure_label=s-upps-p impulsive behavior scale
paper=R1424752 | measure_label=barratt impulsivity (bis) questionnaire
paper=R1422674 | measure_label=barratt impulsiveness scale (bis-11)
paper=R1426527 | measure_label=barratt impulsiveness scale (bis-11)
paper=R1428450 | measure_label=barratt impulsiveness scale (bis-11)
paper=R1430006 | measure_label=bis-15
paper=R1412822 | measure_label=highway task and barrett impulsiveness scale (bis-11)

### Predicted query

SELECT ?paper ?paperLabel ?constructLabel ?measuredByLabel ?justification WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C115015 .
?contribution orkgp:P175094 ?construct .
?contribution orkgp:P175095 ?measuredBy .
OPTIONAL { ?contribution orkgp:P175096 ?justification . }
?paper rdfs:label ?paperLabel .
OPTIONAL { ?construct rdfs:label ?constructRes . }
OPTIONAL { ?measuredBy rdfs:label ?measuredByRes . }
BIND(COALESCE(?constructRes, ?construct) AS ?constructLabel)
BIND(COALESCE(?measuredByRes, ?measuredBy) AS ?measuredByLabel)
FILTER(CONTAINS(LCASE(STR(?constructLabel)), "impulsiv"))
}

### Predicted result (head)

40 rows; columns: paper, paperLabel, constructLabel, measuredByLabel, justification
paper=R1416848 | paperLabel="Pavlov's Buzz? Mobile Vibrations as Conditioned Rewards | constructLabel=impulsivity | measuredByLabel=barratt impulsiveness scale | justification=The Barratt Impulsiveness Scale was used to measure particip
paper=R1417851 | paperLabel=Preference reversals between intertemporal choice and pricin | constructLabel=choice impulsivity | measuredByLabel=binary choice trials | justification=Choice impulsivity is assessed through binary choice trials
paper=R1418721 | paperLabel=INDIVIDUAL DIFFERENCES AND THREAT RESPONSE 1 Politics, Perso | constructLabel=impulsivity and sensation seeking | measuredByLabel=impulsivity and sensation seeking scale (impss) | justification=The research employs the 19-item Impulsivity and Sensation S
paper=R1419660 | paperLabel=The component processes of complex planning follow distinct | constructLabel=impulsivity | measuredByLabel=barratt impulsiveness scale - brief (bis-brief) | justification=Participants completed the BIS-Brief to measure their self-r
paper=R1419780 | paperLabel=On the psychology of the psychology subject pool: an explora | constructLabel=impulsivity | measuredByLabel=barratt impulsivity scale (bis-11) | justification=The BIS-11 scale measures impulsiveness using a 30-question
paper=R1420362 | paperLabel=Characterizing heterogeneity in human reinforcement learning | constructLabel=impulsivity | measuredByLabel=barratt impulsivity scale (bis) | justification=Self-report measures of impulsivity were associated with dec
paper=R1420635 | paperLabel=Methylphenidate enhances or impairs the cognitive control of | constructLabel=trait impulsivity | measuredByLabel=barratt impulsiveness scale (bis-11) | justification=Trait impulsivity was assessed using the BIS-11, a self-repo
paper=R1420783 | paperLabel=Article Title: Search for solutions, learning, simulation, a | constructLabel=impulsivity | measuredByLabel=laboratory tasks (e.g., go-no go tasks, balloon analog risk | justification=The paper highlights that studies using laboratory measures,
paper=R1422674 | paperLabel=Risk Decision-Making Patterns in Suicidal, Non-Suicidal, and | constructLabel=impulsivity | measuredByLabel=barratt impulsiveness scale (bis-11) | justification=The BIS-11 measured three dimensions of impulsivity: 'motor
paper=R1422995 | paperLabel=Impulsivity relates to multi-trial choice strategy in probab | constructLabel=impulsivity | measuredByLabel=s-upps-p impulsive behavior scale | justification=The study uses the Short Version of the UPPS-P Impulsive Beh
paper=R1422995 | paperLabel=Impulsivity relates to multi-trial choice strategy in probab | constructLabel=barratt impulsivity scores (bis-11) | measuredByLabel=bis-11 scale | justification=The Barratt Impulsivity Scale (BIS-11) is referenced in the
paper=R1423262 | paperLabel=Heuristics in risky decision-making relate to preferential r | constructLabel=behavioral impulsivity | measuredByLabel=barratt impulsivity scale (bis) | justification=The Barratt Impulsivity Scale was used to measure behavioral

## Case 5

Question: Which types of diet are investigated in studies on type 2 diabetes?

### Gold query

SELECT ?paper ?diet_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C123091 ; orkgp:P134011 ?d ; orkgp:P191006 ?t . ?d rdfs:label ?dl . ?t rdfs:label ?diet_label . FILTER(LCASE(STR(?dl)) = "type 2 diabetes") }

### Gold result (head)

107 rows; columns: paper, diet_label
paper=R1638119 | diet_label=Fruit-based diet including guava, pineapple, mango, longan,
paper=R1638122 | diet_label=Healthy balanced diet rich in fruits and vegetables: apples,
paper=R1638142 | diet_label=MNT, Mediterranean, DASH, low-fat, low-carb, and high-fiber
paper=R1638203 | diet_label=High- or low-GI meals consumed at breakfast or dinner with c
paper=R1638207 | diet_label=High- versus low-food insulin index (FII) mixed meals matche
paper=R1638210 | diet_label=Mediterranean, low-GI, low-carb, fasting, and chrononutritio
paper=R1638236 | diet_label=Fiber-rich dietary patterns promoting SCFA production throug
paper=R1638256 | diet_label=High-fiber diet with whole grains, prebiotics, and fermentab
paper=R1638259 | diet_label=Dietary fiber supplementation added to standard diabetic die
paper=R1638263 | diet_label=High-fiber, polyphenol-rich, vegetable-protein functional fo
paper=R1638267 | diet_label=Prebiotic galacto-oligosaccharide (GOS) fiber supplementatio
paper=R1638270 | diet_label=Fibre-rich macrobiotic Ma-Pi 2 diet with whole grains, legum

### Predicted query

SELECT DISTINCT ?paper ?paperLabel ?dietLabel WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C123091 .
?paper rdfs:label ?paperLabel .

?contribution orkgp:P134011 ?disease .
OPTIONAL { ?disease rdfs:label ?diseaseL . }
BIND(COALESCE(?diseaseL, ?disease) AS ?diseaseName)
FILTER(CONTAINS(LCASE(STR(?diseaseName)), "type 2 diabetes"))

?contribution orkgp:P191006 ?diet .
OPTIONAL { ?diet rdfs:label ?dietL . }
BIND(COALESCE(?dietL, ?diet) AS ?dietLabel)
}

### Predicted result (head)

115 rows; columns: paper, paperLabel, dietLabel
paper=R1638119 | paperLabel=Phytate and fiber content in Thai fruits commonly consumed b | dietLabel=Fruit-based diet including guava, pineapple, mango, longan,
paper=R1638122 | paperLabel=The prevention and control the type-2 diabetes by changing l | dietLabel=Healthy balanced diet rich in fruits and vegetables: apples,
paper=R1638142 | paperLabel=Position of the Academy of Nutrition and Dietetics: The Role | dietLabel=MNT, Mediterranean, DASH, low-fat, low-carb, and high-fiber
paper=R1638203 | paperLabel=High or low glycemic index (GI) meals at dinner results in g | dietLabel=High- or low-GI meals consumed at breakfast or dinner with c
paper=R1638207 | paperLabel=Validation of the food insulin index in lean, young, healthy | dietLabel=High- versus low-food insulin index (FII) mixed meals matche
paper=R1638210 | paperLabel=Effects of Diet, Lifestyle, Chrononutrition and Alternative | dietLabel=Mediterranean, low-GI, low-carb, fasting, and chrononutritio
paper=R1638236 | paperLabel=Association of short-chain fatty acids and the gut microbiom | dietLabel=Fiber-rich dietary patterns promoting SCFA production throug
paper=R1638256 | paperLabel=Gut bacteria selectively promoted by dietary fibers alleviat | dietLabel=High-fiber diet with whole grains, prebiotics, and fermentab
paper=R1638259 | paperLabel=Additional Effect of Dietary Fiber in Patients with Type 2 D | dietLabel=Dietary fiber supplementation added to standard diabetic die
paper=R1638263 | paperLabel=A dietary intervention with functional foods reduces metabol | dietLabel=High-fiber, polyphenol-rich, vegetable-protein functional fo
paper=R1638267 | paperLabel=Host–microbiome interactions in human type 2 diabetes follow | dietLabel=Prebiotic galacto-oligosaccharide (GOS) fiber supplementatio
paper=R1638270 | paperLabel=Modulation of gut microbiota dysbioses in type 2 diabetic pa | dietLabel=Fibre-rich macrobiotic Ma-Pi 2 diet with whole grains, legum

## Case 6

Question: Which types of diet are investigated in studies on type 2 diabetes?

### Gold query

SELECT ?paper ?diet_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C123091 ; orkgp:P134011 ?d ; orkgp:P191006 ?t . ?d rdfs:label ?dl . ?t rdfs:label ?diet_label . FILTER(LCASE(STR(?dl)) = "type 2 diabetes") }

### Gold result (head)

107 rows; columns: paper, diet_label
paper=R1638119 | diet_label=Fruit-based diet including guava, pineapple, mango, longan,
paper=R1638122 | diet_label=Healthy balanced diet rich in fruits and vegetables: apples,
paper=R1638142 | diet_label=MNT, Mediterranean, DASH, low-fat, low-carb, and high-fiber
paper=R1638203 | diet_label=High- or low-GI meals consumed at breakfast or dinner with c
paper=R1638207 | diet_label=High- versus low-food insulin index (FII) mixed meals matche
paper=R1638210 | diet_label=Mediterranean, low-GI, low-carb, fasting, and chrononutritio
paper=R1638236 | diet_label=Fiber-rich dietary patterns promoting SCFA production throug
paper=R1638256 | diet_label=High-fiber diet with whole grains, prebiotics, and fermentab
paper=R1638259 | diet_label=Dietary fiber supplementation added to standard diabetic die
paper=R1638263 | diet_label=High-fiber, polyphenol-rich, vegetable-protein functional fo
paper=R1638267 | diet_label=Prebiotic galacto-oligosaccharide (GOS) fiber supplementatio
paper=R1638270 | diet_label=Fibre-rich macrobiotic Ma-Pi 2 diet with whole grains, legum

### Predicted query

# id: diet_types_type2_diabetes

# Declare the ORKG prefixes used in the query

# Return the paper, the disease studied, and the type of diet investigated

SELECT ?paper ?paperLabel ?diseaseLabel ?dietLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of this template (Nutritional and Metabolic Diseases)

?contribution a orkgc:C123091 .

# Get the disease name property of the contribution

?contribution orkgp:P134011 ?disease .

# Get the human-readable label of the disease

?disease rdfs:label ?diseaseLabel .

# Keep only studies whose disease label mentions type 2 diabetes (case-insensitive)

FILTER(CONTAINS(LCASE(STR(?diseaseLabel)), LCASE("type 2 diabetes")))

# Get the type of diet property of the contribution

?contribution orkgp:P191006 ?diet .

# Get the human-readable label of the diet type

?diet rdfs:label ?dietLabel .

# Get the paper title for context

?paper rdfs:label ?paperLabel .
}

# Order results alphabetically by diet type, then by paper

ORDER BY ?dietLabel ?paperLabel

### Predicted result (head)

115 rows; columns: paper, paperLabel, diseaseLabel, dietLabel
paper=R1698788 | paperLabel=Low-carbohydrate-diet score and risk of type 2 diabetes in w | diseaseLabel=Type 2 Diabetes | dietLabel=Animal protein, vegetable protein, saturated fat, unsaturate
paper=R1698832 | paperLabel=A randomized controlled trial of 130 g/day low-carbohydrate | diseaseLabel=Type 2 Diabetes | dietLabel=Approximately 130 g/day carbohydrates, vegetables, fish, soy
paper=R1698966 | paperLabel=Effect of a Brown Rice Based Vegan Diet and Conventional Dia | diseaseLabel=Type 2 diabetes | dietLabel=Brown rice–based vegan diet: brown rice, legumes, vegetables
paper=R1698895 | paperLabel=Effects of a carbohydrate-reduced high-protein diet delivere | diseaseLabel=Type 2 diabetes | dietLabel=Carbohydrate-reduced high-protein diet delivered through mea
paper=R1698951 | paperLabel=A carbohydrate-reduced high-protein diet improves HbA1c and | diseaseLabel=Type 2 diabetes | dietLabel=Carbohydrate-reduced, high-protein diet: lean meat, fish, eg
paper=R1698765 | paperLabel=Dietary carbohydrate restriction in type 2 diabetes mellitus | diseaseLabel=Type 2 Diabetes | dietLabel=Carbohydrate-restricted diet.
paper=R1698628 | paperLabel=A network meta-analysis on the comparative efficacy of diffe | diseaseLabel=Type 2 Diabetes | dietLabel=Comparison of Mediterranean, low-carbohydrate, low-GI, DASH,
paper=R1698771 | paperLabel=Effects of Varying Carbohydrate Content of Diet in Patients | diseaseLabel=Type 2 Diabetes | dietLabel=Complex carbohydrates, dietary fiber, whole grains, fruits,
paper=R1698708 | paperLabel=Improved Time in Range During 28 Days of Meal Delivery for P | diseaseLabel=Type 2 Diabetes | dietLabel=Controlled portions of complex carbohydrates, lean proteins,
paper=R1698991 | paperLabel=A healthy diet with and without cereal grains and dairy prod | diseaseLabel=Type 2 diabetes | dietLabel=Diet A: Mediterranean-style healthy diet; Diet B: Similar he
paper=R1698957 | paperLabel=Effect of dried fruit on postprandial glycemia: a randomized | diseaseLabel=Type 2 diabetes | dietLabel=Diet including dried raisins, dates, apricots and other drie
paper=R1638259 | paperLabel=Additional Effect of Dietary Fiber in Patients with Type 2 D | diseaseLabel=Type 2 Diabetes | dietLabel=Dietary fiber supplementation added to standard diabetic die

## Case 7

Question: What are the usual numbers of annotators per NLP task?

### Gold query

SELECT DISTINCT ?contribution ?paper ?paperLabel ?numberOfAnnotators ?NLPTaskTypeLabel ?annotatorAssignmentLabel ?levelOfExpertiseLabel ?annotatorIdentityLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:P181031 ?annotationProcess;
orkgp:P181003 ?NLPTask .

     ?NLPTask orkgp:P181004 ?NLPTaskType .
     ?annotationProcess orkgp:P181032 ?annotator .
     ?annotator orkgp:P59120 ?numberOfAnnotators;
                orkgp:P181033 ?annotatorAssignment;
                orkgp:P181034 ?levelOfExpertise;
                orkgp:P181035 ?annotatorIdentity .

    OPTIONAL { ?NLPTaskType rdfs:label ?NLPTaskTypeLabel . }
    OPTIONAL {?paper rdfs:label ?paperLabel .}
    OPTIONAL {?annotatorAssignment rdfs:label ?annotatorAssignmentLabel .}
    OPTIONAL {?levelOfExpertise rdfs:label ?levelOfExpertiseLabel .}
    OPTIONAL {?annotatorIdentity rdfs:label ?annotatorIdentityLabel .}

} ORDER BY ?paperLabel

### Gold result (head)

75 rows; columns: contribution, paper, paperLabel, numberOfAnnotators, NLPTaskTypeLabel, annotatorAssignmentLabel, levelOfExpertiseLabel, annotatorIdentityLabel
contribution=R1552307 | paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | numberOfAnnotators=1 | NLPTaskTypeLabel=Classification | annotatorAssignmentLabel=One annotator per entry | levelOfExpertiseLabel=Informed outsider | annotatorIdentityLabel=People who have direct contact with the designers
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Classification | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Domain expert | annotatorIdentityLabel=The designers of the technique/tool
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Classification | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Domain expert | annotatorIdentityLabel=People who have direct contact with the designers
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Classification | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Informed outsider | annotatorIdentityLabel=The designers of the technique/tool
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Classification | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Informed outsider | annotatorIdentityLabel=People who have direct contact with the designers
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Information retrieval | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Domain expert | annotatorIdentityLabel=The designers of the technique/tool
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Information retrieval | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Domain expert | annotatorIdentityLabel=People who have direct contact with the designers
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Information retrieval | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Informed outsider | annotatorIdentityLabel=The designers of the technique/tool
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Information retrieval | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Informed outsider | annotatorIdentityLabel=People who have direct contact with the designers
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Information extraction | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Domain expert | annotatorIdentityLabel=The designers of the technique/tool
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Information extraction | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Domain expert | annotatorIdentityLabel=People who have direct contact with the designers
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | numberOfAnnotators=3 | NLPTaskTypeLabel=Information extraction | annotatorAssignmentLabel=Multiple annotators per entry | levelOfExpertiseLabel=Informed outsider | annotatorIdentityLabel=The designers of the technique/tool

### Predicted query

# id: annotators_per_nlp_task

SELECT DISTINCT ?paper ?paperLabel ?taskTypeLabel ?numAnnotators ?numAnnotatorsLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to NLP4RE ID Card contributions

?contribution a orkgc:C121001 .

# Access the NLP task subtemplate of the contribution

?contribution orkgp:P181003 ?nlpTask .

# Access the NLP task type (the task itself) within the NLP task subtemplate

?nlpTask orkgp:P181004 ?taskType .

# Get the human-readable label of the NLP task type

?taskType rdfs:label ?taskTypeLabel .

# Access the annotation process subtemplate of the contribution

?contribution orkgp:P181031 ?annotationProcess .

# Access the annotator subtemplate within the annotation process

?annotationProcess orkgp:P181032 ?annotator .

# Access the number of annotators within the annotator subtemplate

?annotator orkgp:P59120 ?numAnnotators .

# Get the label of the number of annotators value (if it is a resource)

OPTIONAL { ?numAnnotators rdfs:label ?numAnnotatorsLabel . }

# Get the paper label for reference

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?paperLabel

### Predicted result (head)

45 rows; columns: paper, paperLabel, taskTypeLabel, numAnnotators, numAnnotatorsLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | taskTypeLabel=Classification | numAnnotators=1 | numAnnotatorsLabel=
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | taskTypeLabel=Information retrieval | numAnnotators=3 | numAnnotatorsLabel=
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | taskTypeLabel=Information extraction | numAnnotators=3 | numAnnotatorsLabel=
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | taskTypeLabel=Classification | numAnnotators=3 | numAnnotatorsLabel=
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | taskTypeLabel=Information extraction | numAnnotators=7 | numAnnotatorsLabel=
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | taskTypeLabel=Classification | numAnnotators=7 | numAnnotatorsLabel=
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | taskTypeLabel=language modeling | numAnnotators=2 | numAnnotatorsLabel=
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | taskTypeLabel=Information retrieval | numAnnotators=2 | numAnnotatorsLabel=
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | taskTypeLabel=Translation | numAnnotators=8 | numAnnotatorsLabel=
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | taskTypeLabel=Information extraction | numAnnotators=8 | numAnnotatorsLabel=
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | taskTypeLabel=Classification | numAnnotators=8 | numAnnotatorsLabel=
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | taskTypeLabel=Information extraction | numAnnotators=38 | numAnnotatorsLabel=

## Case 8

Question: What empirical methods are used to conduct integrative and interpretive (systematic literature) reviews, so-called secondary research?

### Gold query

    SELECT ?paper, ?dc_method_type_label, ?dc_method_name
        WHERE {
                ?paper orkgp:P31 ?contribution;
                       orkgp:P29 ?year.
                ?contribution a orkgc:C27001;
                              orkgp:P135046 ?serie.
                ?serie rdfs:label ?venue_name.

                ?contribution orkgp:P56008 ?data_collection.
                ?data_collection orkgp:P1005 ?dc_method;
                                 rdfs:label ?dc_label.
                ?dc_method orkgp:P94003 ?dc_method_type;
                           orkgp:P145012 ?dc_method_name.
                ?dc_method_type rdfs:label ?dc_method_type_label.

                FILTER(?dc_method_type_label = "secondary research"^^xsd:string)
                #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }

### Gold result (head)

116 rows; columns: paper, dc_method_type_label, dc_method_name
paper=R713795 | dc_method_type_label=secondary research | dc_method_name=literature review
paper=R713795 | dc_method_type_label=secondary research | dc_method_name=tool review
paper=R734867 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1374601 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1471727 | dc_method_type_label=secondary research | dc_method_name=market research and analysis
paper=R1556242 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556399 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556659 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556702 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556727 | dc_method_type_label=secondary research | dc_method_name=systematic literature review
paper=R1556727 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556765 | dc_method_type_label=secondary research | dc_method_name=literature review

### Predicted query

# id: review_collection_methods

# Namespace declarations

SELECT ?paper ?paperLabel ?methodLabel ?methodTypeLabel ?methodNameLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to Empirical Research Practice contributions

?contribution a orkgc:C27001 .

# Get the paper's title

?paper rdfs:label ?paperLabel .

# Traverse to data collection

?contribution orkgp:P56008 ?dataCollection .

# Traverse to the data collection method

?dataCollection orkgp:P1005 ?method .

# Get the label of the method

?method rdfs:label ?methodLabel .

# Optionally get the method type

OPTIONAL {
?method orkgp:P94003 ?methodType .
?methodType rdfs:label ?methodTypeLabel .
}

# Optionally get the exact method name

OPTIONAL {
?method orkgp:P145012 ?methodName .
?methodName rdfs:label ?methodNameLabel .
}

# Keep only methods that describe literature-based / secondary research (integrative, interpretive, systematic reviews)

FILTER(
CONTAINS(LCASE(STR(?methodLabel)), "literature") ||
CONTAINS(LCASE(STR(?methodLabel)), "review") ||
CONTAINS(LCASE(STR(?methodLabel)), "secondary") ||
CONTAINS(LCASE(STR(?methodLabel)), "integrative") ||
CONTAINS(LCASE(STR(?methodLabel)), "interpretive") ||
(BOUND(?methodNameLabel) && (
CONTAINS(LCASE(STR(?methodNameLabel)), "literature") ||
CONTAINS(LCASE(STR(?methodNameLabel)), "review") ||
CONTAINS(LCASE(STR(?methodNameLabel)), "secondary")))
)
}
ORDER BY ?paperLabel

---

# id: review_analysis_methods

# Namespace declarations

SELECT ?paper ?paperLabel ?analysisMethodLabel ?methodTypeLabel ?analysisTechniqueLabel ?evaluationApproachLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to Empirical Research Practice contributions

?contribution a orkgc:C27001 .

# Get the paper's title

?paper rdfs:label ?paperLabel .

# Ensure the paper's data collection is literature-based (review / secondary research)

?contribution orkgp:P56008 ?dataCollection .
?dataCollection orkgp:P1005 ?collMethod .
?collMethod rdfs:label ?collMethodLabel .
FILTER(
CONTAINS(LCASE(STR(?collMethodLabel)), "literature") ||
CONTAINS(LCASE(STR(?collMethodLabel)), "review") ||
CONTAINS(LCASE(STR(?collMethodLabel)), "secondary") ||
CONTAINS(LCASE(STR(?collMethodLabel)), "integrative") ||
CONTAINS(LCASE(STR(?collMethodLabel)), "interpretive")
)

# Traverse to the data analysis section

?contribution orkgp:P15124 ?dataAnalysis .

# Traverse to the data analysis method

?dataAnalysis orkgp:P1005 ?analysisMethod .

# Get the label of the analysis method

?analysisMethod rdfs:label ?analysisMethodLabel .

# Optionally get the general method type

OPTIONAL {
?analysisMethod orkgp:P94003 ?methodType .
?methodType rdfs:label ?methodTypeLabel .
}

# Optionally get the specific analysis technique

OPTIONAL {
?analysisMethod orkgp:P218006 ?analysisTechnique .
?analysisTechnique rdfs:label ?analysisTechniqueLabel .
}

# Optionally get the evaluation approach

OPTIONAL {
?analysisMethod orkgp:P218007 ?evaluationApproach .
?evaluationApproach rdfs:label ?evaluationApproachLabel .
}
}
ORDER BY ?paperLabel

### Predicted result (head)

0 rows; columns: paper, paperLabel, methodLabel, methodTypeLabel, methodNameLabel

---

0 rows; columns: paper, paperLabel, analysisMethodLabel, methodTypeLabel, analysisTechniqueLabel, evaluationApproachLabel

## Case 9

Question: How long do the dietary interventions last (value and unit)?

### Gold query

SELECT ?paper ?duration_value ?duration_unit WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C123091 ; orkgp:P187010 ?q . ?q orkgp:P45075 ?duration_value . OPTIONAL { ?q orkgp:P45076 ?u . ?u rdfs:label ?duration_unit } }

### Gold result (head)

373 rows; columns: paper, duration_value, duration_unit
paper=R1638129 | duration_value=2 | duration_unit=years
paper=R1638133 | duration_value=12 | duration_unit=Months
paper=R1638136 | duration_value=4 | duration_unit=years
paper=R1638139 | duration_value=12 | duration_unit=Weeks
paper=R1638156 | duration_value=12 | duration_unit=Weeks
paper=R1638167 | duration_value=12 | duration_unit=Weeks
paper=R1638170 | duration_value=6 | duration_unit=Months
paper=R1638181 | duration_value=6 | duration_unit=Days
paper=R1638184 | duration_value=18 | duration_unit=Months
paper=R1638187 | duration_value=4 | duration_unit=Days
paper=R1638213 | duration_value=2 | duration_unit=Days
paper=R1638223 | duration_value=3 | duration_unit=Months

### Predicted query

SELECT ?paper ?paperLabel ?value ?unit ?unitLabel WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C123091 .
?contribution orkgp:P187010 ?duration .
?duration orkgp:P45075 ?value .
?duration orkgp:P45076 ?unit .
?paper rdfs:label ?paperLabel .
OPTIONAL { ?unit rdfs:label ?unitLabel . }
}

### Predicted result (head)

372 rows; columns: paper, paperLabel, value, unit, unitLabel
paper=R1638129 | paperLabel=A Randomized Trial of Low-Protein Diet in Type 1 and in Type | value=2 | unit=R704212 | unitLabel=years
paper=R1638133 | paperLabel=Severe dietary protein restriction in overt diabetic nephrop | value=12 | unit=R1596378 | unitLabel=Months
paper=R1638136 | paperLabel=Effect of dietary protein restriction on prognosis in patien | value=4 | unit=R704212 | unitLabel=years
paper=R1638139 | paperLabel=Safety and efficacy of very low carbohydrate diet in patient | value=12 | unit=R1596383 | unitLabel=Weeks
paper=R1638156 | paperLabel=From 'pleasure to chemistry': the experience of carbohydrate | value=12 | unit=R1596383 | unitLabel=Weeks
paper=R1638167 | paperLabel=Moderated intake of carbohydrates has moderate glycaemic ben | value=12 | unit=R1596383 | unitLabel=Weeks
paper=R1638170 | paperLabel=The Impact of a Low-Carbohydrate Diet on Micronutrient Intak | value=6 | unit=R1596378 | unitLabel=Months
paper=R1638181 | paperLabel=Effect of Nutritional Habits on the Glycemic Response to Dif | value=6 | unit=R1596392 | unitLabel=Days
paper=R1638184 | paperLabel=Greater diet quality is associated with more optimal glycemi | value=18 | unit=R1596378 | unitLabel=Months
paper=R1638187 | paperLabel=Effect of High Versus Low Carbohydrate Intake in the Morning | value=4 | unit=R1596392 | unitLabel=Days
paper=R1638213 | paperLabel=Super Bolus—A Remedy for a High Glycemic Index Meal in Child | value=2 | unit=R1596392 | unitLabel=Days
paper=R1638223 | paperLabel=Comparison of Metabolic Control, Dietary Habits, Activity, a | value=3 | unit=R1596378 | unitLabel=Months

## Case 10

Question: How has the use of statistical methods evolved over time?

### Gold query

SELECT ?paper, ?year, ?da_label, ?test
WHERE {
?paper orkgp:P31 ?contribution;
orkgp:P29 ?year.
?contribution a orkgc:C27001;
orkgp:P135046 ?serie.
?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P15124 ?data_analysis.
                            ?data_analysis rdfs:label ?da_label.

                            OPTIONAl{?data_analysis orkgp:P56043 ?inferential_stats.
                                    OPTIONAL{?inferential_stats orkgp:P35133 ?stats_test.
                                            ?stats_test rdfs:label ?test}
                            }
                    }

                    FILTER(?da_label = 'analysis'^^xsd:string)
                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

---

SELECT ?paper, ?year, ?da_label, ?count, ?percent, ?mean, ?median, ?mode, ?minimum, ?maximum,
?range, ?variance, ?standard_deviation, ?boxplot
WHERE {
?paper orkgp:P31 ?contribution;
orkgp:P29 ?year.
?contribution a orkgc:C27001;
orkgp:P135046 ?serie.
?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P15124 ?data_analysis.
                            ?data_analysis rdfs:label ?da_label.

                            OPTIONAl{?data_analysis orkgp:P56048 ?descriptive_stats.
                                    OPTIONAL{?descriptive_stats orkgp:P56049 ?frequency.
                                            OPTIONAL{?frequency orkgp:P55023 ?count.}
                                            OPTIONAL{?frequency orkgp:P56050 ?percent.}}
                                    OPTIONAL{?descriptive_stats orkgp:P57005 ?central_tendency.
                                            OPTIONAL{?central_tendency orkgp:P47000 ?mean.}
                                            OPTIONAL{?central_tendency orkgp:P57006 ?median.}
                                            OPTIONAL{?central_tendency orkgp:P57007 ?mode.}
                                            OPTIONAL{?central_tendency orkgp:P44107 ?minimum.}
                                            OPTIONAL{?central_tendency orkgp:P44108 ?maximum.}}
                                    OPTIONAL{?descriptive_stats orkgp:P57008 ?variation.
                                            OPTIONAL{?variation orkgp:P4013 ?range.}
                                            OPTIONAL{?variation orkgp:P57009 ?variance.}
                                            OPTIONAL{?variation orkgp:P44087 ?standard_deviation.}}
                                    OPTIONAL{?descriptive_stats orkgp:P57010 ?position.
                                            OPTIONAL{?position orkgp:P59065 ?boxplot.}}
                            }
                    }

                    FILTER(?da_label = 'analysis'^^xsd:string)
                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

681 rows; columns: paper, year, da_label, test
paper=R113008 | year=2017 | da_label=analysis | test=Wilcoxon’s ranksum test
paper=R113067 | year=2017 | da_label=analysis | test=Student’s t-test
paper=R113160 | year=2018 | da_label=analysis | test=wilcoxon signed rank test
paper=R113160 | year=2018 | da_label=analysis | test=shapiro-wilk test
paper=R113160 | year=2018 | da_label=analysis | test=bonferroni adjustment
paper=R113204 | year=2018 | da_label=analysis | test=t-test
paper=R74547 | year=2016 | da_label=analysis | test=ANOVA
paper=R76818 | year=2018 | da_label=analysis | test=Wilcoxon’s ranksum test
paper=R596028 | year=2001 | da_label=analysis | test=chi-square test
paper=R598284 | year=2000 | da_label=analysis | test=mann-whitney-u test
paper=R606868 | year=1999 | da_label=analysis | test=t-test
paper=R647097 | year=1997 | da_label=analysis | test=chi-square test

---

582 rows; columns: paper, year, da_label, count, percent, mean, median, mode, minimum, maximum, range, variance, standard_deviation, boxplot
paper=R108199 | year=2017 | da_label=analysis | count=1 | percent=1 | mean=1 | median=0 | mode=0 | minimum=0 | maximum=0 | range=1 | variance=0 | standard_deviation=0 | boxplot=0
paper=R111988 | year=2016 | da_label=analysis | count=1 | percent=1 | mean=1 | median=1 | mode=0 | minimum=0 | maximum=0 | range=0 | variance=0 | standard_deviation=1 | boxplot=0
paper=R112434 | year=2017 | da_label=analysis | count=1 | percent=1 | mean=1 | median=1 | mode=0 | minimum=1 | maximum=1 | range=0 | variance=0 | standard_deviation=0 | boxplot=0
paper=R113008 | year=2017 | da_label=analysis | count=1 | percent=1 | mean=1 | median=0 | mode=0 | minimum=0 | maximum=0 | range=0 | variance=1 | standard_deviation=1 | boxplot=1
paper=R113067 | year=2017 | da_label=analysis | count=1 | percent=1 | mean=1 | median=1 | mode=0 | minimum=0 | maximum=0 | range=1 | variance=0 | standard_deviation=0 | boxplot=0
paper=R113160 | year=2018 | da_label=analysis | count=1 | percent=1 | mean=1 | median=1 | mode=0 | minimum=0 | maximum=0 | range=0 | variance=0 | standard_deviation=1 | boxplot=1
paper=R113204 | year=2018 | da_label=analysis | count=1 | percent=1 | mean=1 | median=0 | mode=0 | minimum=1 | maximum=0 | range=1 | variance=0 | standard_deviation=0 | boxplot=0
paper=R74547 | year=2016 | da_label=analysis | count=1 | percent=1 | mean=1 | median=0 | mode=0 | minimum=1 | maximum=1 | range=0 | variance=0 | standard_deviation=0 | boxplot=0
paper=R76792 | year=2017 | da_label=analysis | count=1 | percent=1 | mean=1 | median=0 | mode=0 | minimum=0 | maximum=0 | range=0 | variance=0 | standard_deviation=0 | boxplot=1
paper=R76818 | year=2018 | da_label=analysis | count=1 | percent=1 | mean=1 | median=0 | mode=0 | minimum=0 | maximum=0 | range=0 | variance=0 | standard_deviation=0 | boxplot=1
paper=R78392 | year=2015 | da_label=analysis | count=1 | percent=1 | mean=1 | median=0 | mode=0 | minimum=1 | maximum=0 | range=1 | variance=0 | standard_deviation=0 | boxplot=0
paper=R78432 | year=2016 | da_label=analysis | count=1 | percent=1 | mean=1 | median=1 | mode=0 | minimum=0 | maximum=1 | range=0 | variance=0 | standard_deviation=1 | boxplot=1

### Predicted query

# id: statistical_methods_over_time

# Declare the standard ORKG prefixes

# Select publication year, paper, paper title, and the reported data analysis label

SELECT ?year ?paper ?paperLabel ?da_label
WHERE {

# Link the paper to its empirical research contribution

?paper orkgp:P31 ?contribution .

# Restrict to instances of the Empirical Research Practice contribution class

?contribution a orkgc:C27001 .

# Get the publication year from the paper (needed for the temporal analysis)

?paper orkgp:P29 ?year .

# Get the human-readable paper title

?paper rdfs:label ?paperLabel .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue's label

?venue rdfs:label ?venue_label .

# Keep only papers from the IEEE International Requirements Engineering Conference

FILTER(LCASE(STR(?venue_label)) = LCASE("IEEE International Requirements Engineering Conference"))

# Get the data analysis node, which describes the analysis (statistical methods) used

?contribution orkgp:P15124 ?data_analysis .

# Get the label of the data analysis node

?data_analysis rdfs:label ?da_label .

# Exclude papers that report no data analysis (non-empirical)

FILTER(LCASE(STR(?da_label)) != LCASE("no analysis"))
}

# Order rows chronologically so the evolution over time is visible

ORDER BY ?year ?paperLabel

### Predicted result (head)

581 rows; columns: year, paper, paperLabel, da_label
year=1993 | paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | da_label=analysis
year=1993 | paper=R752003 | paperLabel=A translation method from natural language specifications in | da_label=analysis
year=1993 | paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | da_label=analysis
year=1993 | paper=R1374618 | paperLabel=Dealing with performance requirements during the development | da_label=analysis
year=1993 | paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | da_label=analysis
year=1993 | paper=R1387388 | paperLabel=Process knowledge based rapid prototyping for requirements e | da_label=analysis
year=1993 | paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | da_label=analysis
year=1993 | paper=R1388590 | paperLabel=Requirements engineering by example: an empirical study | da_label=analysis
year=1994 | paper=R708774 | paperLabel=A case study of applying rapid prototyping techniques in the | da_label=analysis
year=1994 | paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | da_label=analysis
year=1994 | paper=R713795 | paperLabel=An analysis of the requirements traceability problem | da_label=analysis
year=1994 | paper=R716500 | paperLabel=Comparative analysis of embedded computer system requirement | da_label=analysis

## Case 11

Question: Which combinations of RE and NLP tasks are most (a)typical?

### Gold query

SELECT DISTINCT ?contribution ?paper ?paperLabel ?RETaskLabel ?NLPTaskTypeLabel ?NLPTaskTypeDescription
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:P181002 ?RETask;
orkgp:P181003 ?NLPTask .

    ?NLPTask orkgp:P181004 ?NLPTaskType .
    OPTIONAL{?NLPTaskType orkgp:description ?NLPTaskTypeDescription .}

    OPTIONAL { ?paper rdfs:label ?paperLabel . }
    OPTIONAL { ?RETask rdfs:label ?RETaskLabel . }
    OPTIONAL { ?NLPTaskType rdfs:label ?NLPTaskTypeLabel . }

}
ORDER BY ?contribution ?paperLabel ?NLPTaskTypeLabel

### Gold result (head)

67 rows; columns: contribution, paper, paperLabel, RETaskLabel, NLPTaskTypeLabel, NLPTaskTypeDescription
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | RETaskLabel=Requirements defect detection | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | RETaskLabel=Requirements defect detection | NLPTaskTypeLabel=Information extraction | NLPTaskTypeDescription=glossary, terms
contribution=R1544545 | paper=R194610 | paperLabel=Requirements Classification with Interpretable Machine Learn | RETaskLabel=Requirements classification | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | RETaskLabel=modeling language ambiguity | NLPTaskTypeLabel=Information retrieval | NLPTaskTypeDescription=search / rank
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | RETaskLabel=modeling language ambiguity | NLPTaskTypeLabel=language modeling | NLPTaskTypeDescription=
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | RETaskLabel=Information extraction from legal documents | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | RETaskLabel=Information extraction from legal documents | NLPTaskTypeLabel=Information extraction | NLPTaskTypeDescription=glossary, terms
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | RETaskLabel=Information extraction from legal documents | NLPTaskTypeLabel=Information retrieval | NLPTaskTypeDescription=search / rank
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Information extraction | NLPTaskTypeDescription=glossary, terms
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Translation | NLPTaskTypeDescription=models, tests, etc.
contribution=R1552264 | paper=R1553393 | paperLabel=Extracting Arguments Based on User Decisions in App Reviews | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes

### Predicted query

# id: re_nlp_task_combinations

# Declare the namespace prefixes required for this template

# Return one row per paper and RE/NLP task combination so combinations can be counted

SELECT DISTINCT ?paper ?paperLabel ?reTaskLabel ?nlpTaskLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions instances of the NLP4RE ID Card class

?contribution a orkgc:C121001 .

# Get the RE task addressed by the study

?contribution orkgp:P181002 ?reTask .

# Get the human-readable label of the RE task

?reTask rdfs:label ?reTaskLabel .

# Get the NLP task tackled by the study

?contribution orkgp:P181003 ?nlpTask .

# Get the human-readable label of the NLP task

?nlpTask rdfs:label ?nlpTaskLabel .

# Get the paper label for counting and reporting

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}

# Order by paper so each paper's combinations are grouped together

ORDER BY ?paperLabel

### Predicted result (head)

49 rows; columns: paper, paperLabel, reTaskLabel, nlpTaskLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | reTaskLabel=Requirements retrieval | nlpTaskLabel=NLP task
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | reTaskLabel=Information extraction from legal documents | nlpTaskLabel=NLP task
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | reTaskLabel=Requirements tracing | nlpTaskLabel=NLP task
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | reTaskLabel=Information extraction from natural-langauge requirements sp | nlpTaskLabel=NLP task
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | reTaskLabel=modeling language ambiguity | nlpTaskLabel=NLP task
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | reTaskLabel=Model generation | nlpTaskLabel=NLP task
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | reTaskLabel=Requirements defect detection | nlpTaskLabel=NLP task
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | reTaskLabel=Requirements defect detection | nlpTaskLabel=NLP task
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | reTaskLabel=Requirements retrieval | nlpTaskLabel=NLP task
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | reTaskLabel=Requirements tracing | nlpTaskLabel=NLP task
paper=R195113 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | reTaskLabel=Information extraction from legal documents | nlpTaskLabel=NLP task
paper=R1553533 | paperLabel=Automated Extraction and Clustering of Requirements Glossary | reTaskLabel=Information extraction from requirements | nlpTaskLabel=NLP task

## Case 12

Question: On which continents are ecology and evolution studies conducted, and how many studies are there per continent?

### Gold query

SELECT ?paper ?continent_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C65000 ; <http://orkg.org/orkg/predicate/wikidata:P30> ?k . ?k rdfs:label ?continent_label . }

### Gold result (head)

131 rows; columns: paper, continent_label
paper=R654182 | continent_label=Africa
paper=R654212 | continent_label=Africa
paper=R654244 | continent_label=Africa
paper=R654496 | continent_label=Africa
paper=R654518 | continent_label=Africa
paper=R654630 | continent_label=Africa
paper=R651611 | continent_label=Europe
paper=R651631 | continent_label=Europe
paper=R651634 | continent_label=Europe
paper=R651684 | continent_label=Europe
paper=R651708 | continent_label=Europe
paper=R651832 | continent_label=Europe

### Predicted query

# id: continents_study_counts_direct

# Prefix declarations

# Count distinct papers for each continent

SELECT ?continentLabel (COUNT(DISTINCT ?paper) AS ?studyCount)
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of the Ecology & Evolution template class

?contribution a orkgc:C65000 .

# Get the continent recorded directly on the contribution

?contribution orkgp:wikidata:P30 ?continent .

# Get the human-readable continent name

?continent rdfs:label ?continentLabel .
}
GROUP BY ?continentLabel
ORDER BY DESC(?studyCount)

---

# id: continents_study_counts_via_study_system

# Prefix declarations

# Count distinct papers for each continent recorded within the ecological study system

SELECT ?continentLabel (COUNT(DISTINCT ?paper) AS ?studyCount)
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of the Ecology & Evolution template class

?contribution a orkgc:C65000 .

# Traverse to the ecological study system subtemplate

?contribution orkgp:P115000 ?studySystem .

# Get the continent recorded within the study system

?studySystem orkgp:wikidata:P30 ?continent .

# Get the human-readable continent name

?continent rdfs:label ?continentLabel .
}
GROUP BY ?continentLabel
ORDER BY DESC(?studyCount)

### Predicted result (head)

16 rows; columns: continentLabel, studyCount
continentLabel=North America | studyCount=44
continentLabel=Europe | studyCount=31
continentLabel=South America | studyCount=14
continentLabel=Asia | studyCount=13
continentLabel=Oceania | studyCount=7
continentLabel=Africa | studyCount=7
continentLabel=global | studyCount=2
continentLabel=All | studyCount=2
continentLabel=all | studyCount=2
continentLabel=Great Basin | studyCount=1
continentLabel=NA | studyCount=1
continentLabel=Brazil (22°19′38.4″ S, 41°44'13.41″ W) | studyCount=1

---

3 rows; columns: continentLabel, studyCount
continentLabel=Oceania | studyCount=2
continentLabel=North America | studyCount=2
continentLabel=Europe | studyCount=1

## Case 13

Question: How has the proportion of empirical studies evolved over time?

### Gold query

SELECT ?paper, ?year, ?dc_label, ?da_label, ?venue_name
WHERE {
?paper orkgp:P31 ?contribution;
orkgp:P29 ?year.
?contribution a orkgc:C27001;
orkgp:P135046 ?serie.
?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P56008 ?data_collection.
                            ?data_collection rdfs:label ?dc_label.
                            }
                    OPTIONAL{?contribution orkgp:P15124 ?data_analysis.
                            ?data_analysis rdfs:label ?da_label.
                            }

                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                #     FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

777 rows; columns: paper, year, dc_label, da_label, venue_name
paper=R108199 | year=2017 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R111988 | year=2016 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R112434 | year=2017 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R113008 | year=2017 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R113067 | year=2017 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R113160 | year=2018 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R113204 | year=2018 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R74547 | year=2016 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R76792 | year=2017 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R76818 | year=2018 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R78392 | year=2015 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference
paper=R78432 | year=2016 | dc_label=collection | da_label=analysis | venue_name=IEEE International Requirements Engineering Conference

### Predicted query

# id: empirical_proportion_by_year

# Declare the namespace prefixes

# Count total papers and empirical papers per publication year

SELECT ?year (COUNT(?paper) AS ?total_papers) (SUM(?isEmpirical) AS ?empirical_papers)
WHERE {

# Inner query: one row per paper with an empirical flag (1 = empirical, 0 = not)

{
SELECT ?paper ?year (MAX(?flag) AS ?isEmpirical)
WHERE { # Link the paper to its contribution
?paper orkgp:P31 ?contribution . # Restrict to the Empirical Research Practice contribution class
?contribution a orkgc:C27001 . # Get the publication year from the paper
?paper orkgp:P29 ?year . # Get the venue of the contribution
?contribution orkgp:P135046 ?venue . # Get the venue label for filtering
?venue rdfs:label ?venue_name . # Keep only IEEE International Requirements Engineering Conference papers (case-insensitive)
FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference")) # Get the data collection node and its label, if present
OPTIONAL {
?contribution orkgp:P56008 ?dc .
?dc rdfs:label ?dc_label .
} # Get the data analysis node and its label, if present
OPTIONAL {
?contribution orkgp:P15124 ?da .
?da rdfs:label ?da_label .
} # Flag as empirical only if collection is not "no collection" and analysis is not "no analysis"
BIND(IF(BOUND(?dc_label) && BOUND(?da_label) && LCASE(STR(?dc_label)) != LCASE("no collection") && LCASE(STR(?da_label)) != LCASE("no analysis"), 1, 0) AS ?flag)
} # One row per paper and year
GROUP BY ?paper ?year
}
}

# Aggregate per publication year

GROUP BY ?year

# Sort chronologically

ORDER BY ?year

### Predicted result (head)

33 rows; columns: year, total_papers, empirical_papers
year=1993 | total_papers=21 | empirical_papers=8
year=1994 | total_papers=21 | empirical_papers=9
year=1995 | total_papers=20 | empirical_papers=11
year=1996 | total_papers=27 | empirical_papers=9
year=1997 | total_papers=20 | empirical_papers=9
year=1998 | total_papers=23 | empirical_papers=12
year=1999 | total_papers=19 | empirical_papers=14
year=2000 | total_papers=14 | empirical_papers=10
year=2001 | total_papers=26 | empirical_papers=17
year=2002 | total_papers=32 | empirical_papers=19
year=2003 | total_papers=25 | empirical_papers=17
year=2004 | total_papers=27 | empirical_papers=18

## Case 14

Question: What is the most common format of textual requirements?

### Gold query

SELECT DISTINCT ?contribution ?paper ?paperLabel ?NLPdataformatLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:P181011 ?NLPdataset .
?NLPdataset orkgp:P181022 ?NLPdatatype .
?NLPdatatype orkgp:P181023 ?NLPdataformat .

    OPTIONAL {?paper rdfs:label ?paperLabel .}
    OPTIONAL {?NLPdataformat rdfs:label ?NLPdataformatLabel .}

} ORDER BY ?contribution

### Gold result (head)

62 rows; columns: contribution, paper, paperLabel, NLPdataformatLabel
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPdataformatLabel="Shall" requirements
contribution=R1544545 | paper=R194610 | paperLabel=Requirements Classification with Interpretable Machine Learn | NLPdataformatLabel="Shall" requirements
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | NLPdataformatLabel="Shall" requirements
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | NLPdataformatLabel=Legal text
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | NLPdataformatLabel=Scenarios
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | NLPdataformatLabel=Use cases
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | NLPdataformatLabel=white papers
contribution=R1552264 | paper=R1553393 | paperLabel=Extracting Arguments Based on User Decisions in App Reviews | NLPdataformatLabel=Messages in user forums
contribution=R1552282 | paper=R1553362 | paperLabel=On the automatic classification of app reviews | NLPdataformatLabel=User reviews
contribution=R1552307 | paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | NLPdataformatLabel="Shall" requirements
contribution=R1552338 | paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | NLPdataformatLabel="Shall" requirements
contribution=R1552338 | paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | NLPdataformatLabel=code

### Predicted query

# id: most_common_textual_requirement_format

# Declare the namespace prefixes required by the ORKG schema

# Select the paper, its label, the data type label, and the data format label

SELECT DISTINCT ?paper ?paperLabel ?dataTypeLabel ?formatLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions that are instances of the NLP4RE ID Card template class

?contribution a orkgc:C121001 .

# Follow the NLP dataset branch of the contribution

?contribution orkgp:P181011 ?subtemplate .

# Access the NLP data type under the dataset

?subtemplate orkgp:P181022 ?nestedtemplate .

# Get the data type resource

?nestedtemplate rdfs:label ?dataTypeLabel .

# Access the NLP data format nested under the data type

?nestedtemplate orkgp:P181023 ?nestedtarget .

# Get the human-readable label of the data format

?nestedtarget rdfs:label ?formatLabel .

# Retrieve the paper label for counting per paper

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?paperLabel

### Predicted result (head)

59 rows; columns: paper, paperLabel, dataTypeLabel, formatLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | dataTypeLabel=NLP data type | formatLabel="Shall" requirements
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | dataTypeLabel=NLP data type | formatLabel=Legal text
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | dataTypeLabel=NLP data type | formatLabel="Shall" requirements
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | dataTypeLabel=NLP data type | formatLabel=code
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | dataTypeLabel=NLP data type | formatLabel="Shall" requirements
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | dataTypeLabel=NLP data type | formatLabel="Shall" requirements
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | dataTypeLabel=NLP data type | formatLabel="Shall" requirements
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | dataTypeLabel=NLP data type | formatLabel="Shall" requirements
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | dataTypeLabel=NLP data type | formatLabel=Messages in user forums
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | dataTypeLabel=NLP data type | formatLabel="Shall" requirements
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | dataTypeLabel=NLP data type | formatLabel=Use cases
paper=R195113 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | dataTypeLabel=NLP data type | formatLabel=Legal text

## Case 15

Question: What are the different levels of granularity at which inputs can be represented, and how is this related to the RE task?

### Gold query

SELECT DISTINCT ?contribution ?paper ?paperLabel ?RETaskLabel ?NLPTaskInputLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:P181002 ?RETask;
orkgp:P181003 ?NLPTask.
?NLPTask orkgp:P181005 ?NLPTaskInput .

    OPTIONAL {?paper rdfs:label ?paperLabel .}
    OPTIONAL {?RETask rdfs:label ?RETaskLabel .}
    OPTIONAL {?NLPTaskInput rdfs:label ?NLPTaskInputLabel .}

}ORDER BY ?contribution

### Gold result (head)

66 rows; columns: contribution, paper, paperLabel, RETaskLabel, NLPTaskInputLabel
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | RETaskLabel=Requirements defect detection | NLPTaskInputLabel=Phrases
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | RETaskLabel=Requirements defect detection | NLPTaskInputLabel=Words
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | RETaskLabel=Requirements defect detection | NLPTaskInputLabel=Detection focuses on words (pronouns), resolution looks for
contribution=R1544545 | paper=R194610 | paperLabel=Requirements Classification with Interpretable Machine Learn | RETaskLabel=Requirements classification | NLPTaskInputLabel=Document
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | RETaskLabel=modeling language ambiguity | NLPTaskInputLabel=Document
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | RETaskLabel=modeling language ambiguity | NLPTaskInputLabel=Words
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | RETaskLabel=Information extraction from legal documents | NLPTaskInputLabel=Document
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskInputLabel=Paragraphs
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskInputLabel=Sentences
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskInputLabel=Document
contribution=R1552264 | paper=R1553393 | paperLabel=Extracting Arguments Based on User Decisions in App Reviews | RETaskLabel=Information extraction from requirements | NLPTaskInputLabel=Sentences
contribution=R1552264 | paper=R1553393 | paperLabel=Extracting Arguments Based on User Decisions in App Reviews | RETaskLabel=Information extraction from requirements | NLPTaskInputLabel=Document

### Predicted query

# id: re_task_by_dataset

# Namespace declarations

# Select each paper with its RE task and the NLP dataset (input) it uses

SELECT DISTINCT ?paper ?paperLabel ?re_taskLabel ?datasetLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to NLP4RE ID Card contributions

?contribution a orkgc:C121001 .

# Get the RE task addressed by the study

?contribution orkgp:P181002 ?re_task .

# Get the human-readable label of the RE task

?re_task rdfs:label ?re_taskLabel .

# Get the NLP dataset used as input

OPTIONAL {
?contribution orkgp:P181011 ?dataset .
?dataset rdfs:label ?datasetLabel .
}

# Get the paper title for counting and ordering

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}

# Order by paper so each paper's rows stay together

## ORDER BY ?paperLabel

# id: dataset_format_granularity

# Namespace declarations

# Select each paper with its RE task and the granularity of its input data (datatype and data format)

SELECT DISTINCT ?paper ?paperLabel ?re_taskLabel ?datasetLabel ?datatypeLabel ?dataformatLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to NLP4RE ID Card contributions

?contribution a orkgc:C121001 .

# Get the RE task addressed by the study

?contribution orkgp:P181002 ?re_task .

# Get the human-readable label of the RE task

?re_task rdfs:label ?re_taskLabel .

# Get the NLP dataset used as input

?contribution orkgp:P181011 ?dataset .

# Get the label of the dataset

OPTIONAL { ?dataset rdfs:label ?datasetLabel . }

# Get the datatype of the dataset (input representation)

OPTIONAL {
?dataset orkgp:P181022 ?datatype .
?datatype rdfs:label ?datatypeLabel . # Get the data format of that datatype (granularity of representation)
OPTIONAL {
?datatype orkgp:P181023 ?dataformat .
?dataformat rdfs:label ?dataformatLabel .
}
}

# Get the paper title for ordering

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}

# Order by paper so each paper's rows stay together

ORDER BY ?paperLabel

### Predicted result (head)

49 rows; columns: paper, paperLabel, re_taskLabel, datasetLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | re_taskLabel=Requirements retrieval | datasetLabel=NLP dataset
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | re_taskLabel=Information extraction from legal documents | datasetLabel=NLP dataset
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | re_taskLabel=Requirements tracing | datasetLabel=NLP dataset
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | re_taskLabel=Information extraction from natural-langauge requirements sp | datasetLabel=NLP dataset
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | re_taskLabel=modeling language ambiguity | datasetLabel=NLP dataset
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | re_taskLabel=Model generation | datasetLabel=NLP dataset
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | re_taskLabel=Requirements defect detection | datasetLabel=NLP dataset
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | re_taskLabel=Requirements defect detection | datasetLabel=NLP dataset
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | re_taskLabel=Requirements retrieval | datasetLabel=NLP dataset
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | re_taskLabel=Requirements tracing | datasetLabel=NLP dataset
paper=R195113 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | re_taskLabel=Information extraction from legal documents | datasetLabel=NLP dataset
paper=R1553533 | paperLabel=Automated Extraction and Clustering of Requirements Glossary | re_taskLabel=Information extraction from requirements | datasetLabel=NLP dataset

---

60 rows; columns: paper, paperLabel, re_taskLabel, datasetLabel, datatypeLabel, dataformatLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | re_taskLabel=Requirements retrieval | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | re_taskLabel=Information extraction from legal documents | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel=Legal text
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | re_taskLabel=Requirements tracing | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | re_taskLabel=Requirements tracing | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel=code
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | re_taskLabel=Information extraction from natural-langauge requirements sp | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | re_taskLabel=modeling language ambiguity | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | re_taskLabel=Model generation | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | re_taskLabel=Requirements defect detection | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | re_taskLabel=Requirements defect detection | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | re_taskLabel=Requirements retrieval | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel=Messages in user forums
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | re_taskLabel=Requirements tracing | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel="Shall" requirements
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | re_taskLabel=Requirements tracing | datasetLabel=NLP dataset | datatypeLabel=NLP data type | dataformatLabel=Use cases

## Case 16

Question: How often are which empirical methods used over time?

### Gold query

    SELECT ?paper, ?year, ?dc_method_type_label
        WHERE {
                ?paper orkgp:P31 ?contribution;
                       orkgp:P29 ?year.
                ?contribution a orkgc:C27001;
                              orkgp:P135046 ?serie.
                ?serie rdfs:label ?venue_name.

                OPTIONAL{?contribution orkgp:P56008 ?data_collection.
                         ?data_collection orkgp:P1005 ?dc_method;
                                          rdfs:label ?dc_label.
                         ?dc_method orkgp:P94003 ?dc_method_type.
                         ?dc_method_type rdfs:label ?dc_method_type_label.
                }

                FILTER(?dc_label != "no collection"^^xsd:string)
                #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }

---

    SELECT DISTINCT ?paper ?year ?da_label
                (SAMPLE(?descriptive) AS ?descriptive)
                (SAMPLE(?inferential) AS ?inferential)
                (SAMPLE(?machine_learning) AS ?machine_learning)
                (SAMPLE(?method) AS ?method)
        WHERE {
        ?paper orkgp:P31 ?contribution;
                orkgp:P29 ?year.

        ?contribution a orkgc:C27001;
                        orkgp:P135046 ?serie;
                        orkgp:P15124 ?data_analysis.

        ?data_analysis rdfs:label ?da_label.

        OPTIONAL { ?data_analysis orkgp:P56048/rdfs:label ?descriptive. }
        OPTIONAL { ?data_analysis orkgp:P56043/rdfs:label ?inferential. }
        OPTIONAL { ?data_analysis orkgp:P57016/rdfs:label ?machine_learning. }
        OPTIONAL { ?data_analysis orkgp:P1005/rdfs:label ?method. }

        ?serie rdfs:label ?venue_name.

        FILTER(?da_label != "no analysis"^^xsd:string)
        FILTER(?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }
        GROUP BY ?paper ?year ?da_label

### Gold result (head)

978 rows; columns: paper, year, dc_method_type_label
paper=R108199 | year=2017 | dc_method_type_label=secondary research
paper=R108199 | year=2017 | dc_method_type_label=experiment
paper=R111988 | year=2016 | dc_method_type_label=secondary research
paper=R111988 | year=2016 | dc_method_type_label=experiment
paper=R112434 | year=2017 | dc_method_type_label=secondary research
paper=R113008 | year=2017 | dc_method_type_label=survey
paper=R113008 | year=2017 | dc_method_type_label=study
paper=R113067 | year=2017 | dc_method_type_label=secondary research
paper=R113160 | year=2018 | dc_method_type_label=secondary research
paper=R113204 | year=2018 | dc_method_type_label=experiment
paper=R74547 | year=2016 | dc_method_type_label=experiment
paper=R76792 | year=2017 | dc_method_type_label=secondary research

---

581 rows; columns: paper, year, da_label, descriptive, inferential, machine_learning, method
paper=R578027 | year=2006 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=comparative analysis
paper=R583218 | year=2004 | da_label=analysis | descriptive= | inferential= | machine_learning= | method=document matrix
paper=R225589 | year=2012 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=coding
paper=R583172 | year=2004 | da_label=analysis | descriptive=descriptive | inferential=inferential | machine_learning= | method=
paper=R1556972 | year=2025 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=pairwise kappa analysis
paper=R1543501 | year=2023 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=thematic analysis
paper=R194428 | year=2019 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=
paper=R597409 | year=2001 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=Component-Bus-System-Property approach
paper=R220364 | year=2013 | da_label=analysis | descriptive=descriptive | inferential=inferential | machine_learning=machine learning | method=
paper=R211438 | year=2014 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=
paper=R193798 | year=2021 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=Crowdsourcing
paper=R675312 | year=1996 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=grounded theory

### Predicted query

# id: data_collection_methods_over_time

# Namespace declarations

SELECT ?paper ?paperLabel ?year ?method_type_label
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to contribution instances of this template

?contribution a orkgc:C27001 .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_name .

# Keep only the IEEE International Requirements Engineering Conference

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Get the paper title

?paper rdfs:label ?paperLabel .

# Get the publication year of the paper

?paper orkgp:P29 ?year .

# Reach the data collection node of the contribution

?contribution orkgp:P56008 ?dataCollection .

# Get the data collection label

?dataCollection rdfs:label ?dc_label .

# Exclude papers without data collection

FILTER(LCASE(STR(?dc_label)) != LCASE("no collection"))

# Reach the data collection method(s)

?dataCollection orkgp:P1005 ?method .

# Reach the method type of each collection method

?method orkgp:P94003 ?methodType .

# Get the human-readable method type label

?methodType rdfs:label ?method_type_label .
}
ORDER BY ?year ?paperLabel

---

# id: data_analysis_methods_over_time

# Namespace declarations

SELECT ?paper ?paperLabel ?year ?method_type_label
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to contribution instances of this template

?contribution a orkgc:C27001 .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_name .

# Keep only the IEEE International Requirements Engineering Conference

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Get the paper title

?paper rdfs:label ?paperLabel .

# Get the publication year of the paper

?paper orkgp:P29 ?year .

# Reach the data analysis node of the contribution

?contribution orkgp:P15124 ?dataAnalysis .

# Get the data analysis label

?dataAnalysis rdfs:label ?da_label .

# Exclude papers without data analysis

FILTER(LCASE(STR(?da_label)) != LCASE("no analysis"))

# Reach the data analysis method(s)

?dataAnalysis orkgp:P1005 ?method .

# Reach the method type of each analysis method

?method orkgp:P94003 ?methodType .

# Get the human-readable method type label

?methodType rdfs:label ?method_type_label .
}
ORDER BY ?year ?paperLabel

### Predicted result (head)

978 rows; columns: paper, paperLabel, year, method_type_label
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | method_type_label=interview
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | method_type_label=study
paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | year=1993 | method_type_label=secondary research
paper=R1374618 | paperLabel=Dealing with performance requirements during the development | year=1993 | method_type_label=study
paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | year=1993 | method_type_label=study
paper=R1387388 | paperLabel=Process knowledge based rapid prototyping for requirements e | year=1993 | method_type_label=study
paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | year=1993 | method_type_label=case study
paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | year=1993 | method_type_label=study
paper=R1388590 | paperLabel=Requirements engineering by example: an empirical study | year=1993 | method_type_label=survey
paper=R1388590 | paperLabel=Requirements engineering by example: an empirical study | year=1993 | method_type_label=study
paper=R708774 | paperLabel=A case study of applying rapid prototyping techniques in the | year=1994 | method_type_label=case study
paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | year=1994 | method_type_label=case study

---

0 rows; columns: paper, paperLabel, year, method_type_label

## Case 17

Question: How has the proportion of empirical methods to conduct (systematic literature) reviews, so-called secondary research, evolved over time?

### Gold query

    SELECT ?paper, ?year, ?dc_method_type_label, ?dc_method_name
        WHERE {
                ?paper orkgp:P31 ?contribution;
                       orkgp:P29 ?year.
                ?contribution a orkgc:C27001;
                              orkgp:P135046 ?serie.
                ?serie rdfs:label ?venue_name.

                ?contribution orkgp:P56008 ?data_collection.
                ?data_collection orkgp:P1005 ?dc_method;
                                 rdfs:label ?dc_label.
                ?dc_method orkgp:P94003 ?dc_method_type;
                           orkgp:P145012 ?dc_method_name.
                ?dc_method_type rdfs:label ?dc_method_type_label.

                FILTER(?dc_method_type_label = "secondary research"^^xsd:string)
                #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }

### Gold result (head)

116 rows; columns: paper, year, dc_method_type_label, dc_method_name
paper=R713795 | year=1994 | dc_method_type_label=secondary research | dc_method_name=literature review
paper=R713795 | year=1994 | dc_method_type_label=secondary research | dc_method_name=tool review
paper=R734867 | year=1994 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1374601 | year=1993 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1471727 | year=2023 | dc_method_type_label=secondary research | dc_method_name=market research and analysis
paper=R1556242 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556399 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556659 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556702 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556727 | year=2025 | dc_method_type_label=secondary research | dc_method_name=systematic literature review
paper=R1556727 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556765 | year=2025 | dc_method_type_label=secondary research | dc_method_name=literature review

### Predicted query

# id: sr_method_proportion_by_year

# Namespace declarations for the ORKG vocabulary

# Select publication year, paper, and the method labels used for secondary research

SELECT ?year ?paper ?paperLabel ?dataCollectionMethodLabel ?analysisMethodTypeLabel
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of the Empirical Research Practice template

?contribution a orkgc:C27001 .

# Get the publication year of the paper (temporal analysis)

?paper orkgp:P29 ?year .

# Get the paper title for reference

?paper rdfs:label ?paperLabel .

# Optional: data collection method name (e.g., systematic literature review as a data collection method)

OPTIONAL { # Traverse from the contribution to the data collection block
?contribution orkgp:P56008 ?dataCollection . # Traverse to the data collection method entries
?dataCollection orkgp:P1005 ?dcMethod . # Get the exact method name
?dcMethod orkgp:P145012 ?dataCollectionMethod . # Prefer the resource label; fall back to the literal value
OPTIONAL { ?dataCollectionMethod rdfs:label ?dcLabel } # Use the label if available, otherwise the raw value as string
BIND(COALESCE(?dcLabel, STR(?dataCollectionMethod)) AS ?dataCollectionMethodLabel)
}

# Optional: data analysis method type (e.g., literature review / secondary research as a general method type)

OPTIONAL { # Traverse from the contribution to the data analysis block
?contribution orkgp:P15124 ?dataAnalysis . # Traverse to the analysis method entries
?dataAnalysis orkgp:P1005 ?daMethod . # Get the general method type
?daMethod orkgp:P94003 ?analysisMethodType . # Get the label of the method type
?analysisMethodType rdfs:label ?analysisMethodTypeLabel .
}
}
ORDER BY ?year ?paperLabel

### Predicted result (head)

1151 rows; columns: year, paper, paperLabel, dataCollectionMethodLabel, analysisMethodTypeLabel
year=1993 | paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | dataCollectionMethodLabel=field study | analysisMethodTypeLabel=
year=1993 | paper=R752003 | paperLabel=A translation method from natural language specifications in | dataCollectionMethodLabel=example | analysisMethodTypeLabel=
year=1993 | paper=R752108 | paperLabel=An incremental integration tool between requirements enginee | dataCollectionMethodLabel=no method | analysisMethodTypeLabel=
year=1993 | paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | dataCollectionMethodLabel=archive analysis | analysisMethodTypeLabel=
year=1993 | paper=R1374618 | paperLabel=Dealing with performance requirements during the development | dataCollectionMethodLabel=running example | analysisMethodTypeLabel=
year=1993 | paper=R759344 | paperLabel=Defaults in specifications | dataCollectionMethodLabel=no method | analysisMethodTypeLabel=
year=1993 | paper=R1355372 | paperLabel=Description of specification developments | dataCollectionMethodLabel=no method | analysisMethodTypeLabel=
year=1993 | paper=R1355793 | paperLabel=Documentation of requirements for computer systems | dataCollectionMethodLabel=no method | analysisMethodTypeLabel=
year=1993 | paper=R1355398 | paperLabel=Domain descriptions | dataCollectionMethodLabel=no method | analysisMethodTypeLabel=
year=1993 | paper=R1385593 | paperLabel=Domain modelling with hierarchies of alternative viewpoints | dataCollectionMethodLabel=no method | analysisMethodTypeLabel=
year=1993 | paper=R1385604 | paperLabel=Formally specifying temporal constraints and error recovery | dataCollectionMethodLabel=no method | analysisMethodTypeLabel=
year=1993 | paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | dataCollectionMethodLabel=ethnographic study | analysisMethodTypeLabel=

## Case 18

Question: How is impulsivity measured across studies?

### Gold query

SELECT ?paper ?measure_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C115015 ; orkgp:P175094 ?x ; orkgp:P175095 ?m . ?x rdfs:label ?xl . ?m rdfs:label ?measure_label . FILTER(LCASE(STR(?xl)) = "impulsivity") }

### Gold result (head)

18 rows; columns: paper, measure_label
paper=R1416848 | measure_label=barratt impulsiveness scale
paper=R1419660 | measure_label=barratt impulsiveness scale - brief (bis-brief)
paper=R1419780 | measure_label=barratt impulsivity scale (bis-11)
paper=R1420362 | measure_label=barratt impulsivity scale (bis)
paper=R1420783 | measure_label=laboratory tasks (e.g., go-no go tasks, balloon analog risk
paper=R1422995 | measure_label=s-upps-p impulsive behavior scale
paper=R1424752 | measure_label=barratt impulsivity (bis) questionnaire
paper=R1422674 | measure_label=barratt impulsiveness scale (bis-11)
paper=R1426527 | measure_label=barratt impulsiveness scale (bis-11)
paper=R1428450 | measure_label=barratt impulsiveness scale (bis-11)
paper=R1430006 | measure_label=bis-15
paper=R1412822 | measure_label=highway task and barrett impulsiveness scale (bis-11)

### Predicted query

# id: impulsivity_measures_across_studies

# Declare the PREFIX block for ORKG namespaces

# Select the paper, its title, the construct label, and the measurement instrument label

SELECT ?paper ?paperLabel ?constructLabel ?measured_byLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of the Psychology Constructs and Measurements template

?contribution a orkgc:C115015 .

# Get the paper's title for reporting

?paper rdfs:label ?paperLabel .

# Get the construct studied in this contribution

?contribution orkgp:P175094 ?construct .

# Get the human-readable label of the construct

?construct rdfs:label ?constructLabel .

# Keep only constructs whose label mentions impulsivity (case-insensitive)

FILTER(CONTAINS(LCASE(STR(?constructLabel)), LCASE("impulsiv")))

# Get the measurement instrument(s) used to measure the construct

?contribution orkgp:P175095 ?measured_by .

# Get the human-readable label of each measurement instrument

?measured_by rdfs:label ?measured_byLabel .
}

# Order rows by paper title so each study's measures appear together

ORDER BY ?paperLabel

### Predicted result (head)

40 rows; columns: paper, paperLabel, constructLabel, measured_byLabel
paper=R1416848 | paperLabel="Pavlov's Buzz? Mobile Vibrations as Conditioned Rewards | constructLabel=impulsivity | measured_byLabel=barratt impulsiveness scale
paper=R1420783 | paperLabel=Article Title: Search for solutions, learning, simulation, a | constructLabel=impulsivity | measured_byLabel=laboratory tasks (e.g., go-no go tasks, balloon analog risk
paper=R1426527 | paperLabel=Audiovisual Decision-Making and Sensory Evidence Weighting i | constructLabel=impulsivity | measured_byLabel=barratt impulsiveness scale (bis-11)
paper=R1424752 | paperLabel=Bayesian Decision-Making Under Uncertainty in Borderline Per | constructLabel=impulsivity | measured_byLabel=barratt impulsivity (bis) questionnaire
paper=R1426499 | paperLabel=Body appearance values modulate risk aversion in eating rest | constructLabel=impulsiveness | measured_byLabel=barratt impulsiveness scale version 11 (bis-11)
paper=R1423682 | paperLabel=Catecholaminergic modulation of the cost of cognitive contro | constructLabel=trait impulsivity | measured_byLabel=barratt impulsiveness scale (bis-11)
paper=R1420362 | paperLabel=Characterizing heterogeneity in human reinforcement learning | constructLabel=impulsivity | measured_byLabel=barratt impulsivity scale (bis)
paper=R1416285 | paperLabel=Dissociable behavioural signatures of co-existing impulsivit | constructLabel=impulsivity | measured_byLabel=barratt impulsiveness scale (bis-11)
paper=R1416285 | paperLabel=Dissociable behavioural signatures of co-existing impulsivit | constructLabel=impulsivity | measured_byLabel=urgency, premeditation, perseverance, sensation seeking, pos
paper=R1415868 | paperLabel=Distinct Developmental Trajectories In The Cognitive Compone | constructLabel=impulsiveness | measured_byLabel=barratt impulsiveness scale -brief (bis-brief)
paper=R1415834 | paperLabel=Dorsomedial and ventromedial prefrontal cortex lesions diffe | constructLabel=temporal impulsivity | measured_byLabel=preference-uncertainty (ku) model
paper=R1423262 | paperLabel=Heuristics in risky decision-making relate to preferential r | constructLabel=behavioral impulsivity | measured_byLabel=barratt impulsivity scale (bis)

## Case 19

Question: What is the state of practice for validating the quality of the annotated datasets?

### Gold query

SELECT DISTINCT ?contribution ?paper ?paperLabel ?intercoderReliabilityMetricLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:P181031 ?annotationProcess .
?annotationProcess orkgp:P181041 ?annotationAgreement .
?annotationAgreement orkgp:P181042 ?intercoderReliabilityMetric .

    OPTIONAL {?paper rdfs:label ?paperLabel .}
    OPTIONAL {?intercoderReliabilityMetric rdfs:label ?intercoderReliabilityMetricLabel .}

} ORDER BY ?contribution

### Gold result (head)

53 rows; columns: contribution, paper, paperLabel, intercoderReliabilityMetricLabel
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | intercoderReliabilityMetricLabel=Not reported
contribution=R1544545 | paper=R194610 | paperLabel=Requirements Classification with Interpretable Machine Learn | intercoderReliabilityMetricLabel=Krippendorf's Alpha
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | intercoderReliabilityMetricLabel=Cohen's K
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | intercoderReliabilityMetricLabel=Cohen's K
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | intercoderReliabilityMetricLabel=Not reported
contribution=R1552264 | paper=R1553393 | paperLabel=Extracting Arguments Based on User Decisions in App Reviews | intercoderReliabilityMetricLabel=interagreement ratio
contribution=R1552282 | paper=R1553362 | paperLabel=On the automatic classification of app reviews | intercoderReliabilityMetricLabel=Not reported
contribution=R1552307 | paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | intercoderReliabilityMetricLabel=Cohen's K
contribution=R1552338 | paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | intercoderReliabilityMetricLabel=Not reported
contribution=R1552363 | paper=R1553452 | paperLabel=Is the SAFE Approach Too Simple for App Feature Extraction? | intercoderReliabilityMetricLabel=Dice 0.28
contribution=R1552389 | paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | intercoderReliabilityMetricLabel=Cohen's K
contribution=R1552412 | paper=R193481 | paperLabel=Extracting and classifying requirements from software engine | intercoderReliabilityMetricLabel=Not reported

### Predicted query

# id: annotator_agreement_quality_validation

# Declare the namespace prefixes required by the ORKG template schema

# Return distinct papers with the annotator agreement measure used to validate annotation quality

SELECT DISTINCT ?paper ?paperLabel ?annotatorAgreementLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to NLP4RE ID Card contributions

?contribution a orkgc:C121001 .

# Reach the annotation process of the dataset

?contribution orkgp:P181031 ?annotationProcess .

# Reach the annotator agreement applied to the annotated dataset

?annotationProcess orkgp:P181041 ?annotatorAgreement .

# Get the human-readable label of the agreement measure

?annotatorAgreement rdfs:label ?annotatorAgreementLabel .

# Get the paper title for counting and display

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?paperLabel

---

# id: guideline_and_scheme_quality_validation

# Declare the namespace prefixes required by the ORKG template schema

# Return distinct papers with the guideline availability reported for the annotation scheme

SELECT DISTINCT ?paper ?paperLabel ?guidelineLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to NLP4RE ID Card contributions

?contribution a orkgc:C121001 .

# Reach the annotation process of the dataset

?contribution orkgp:P181031 ?annotationProcess .

# Reach the annotation scheme used for the dataset

?annotationProcess orkgp:P181036 ?annotationScheme .

# Reach whether the written guidelines were made public

?annotationScheme orkgp:P181038 ?guideline .

# Get the human-readable label of the guideline availability value

?guideline rdfs:label ?guidelineLabel .

# Get the paper title for counting and display

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?paperLabel

### Predicted result (head)

48 rows; columns: paper, paperLabel, annotatorAgreementLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | annotatorAgreementLabel=Annotator agreement
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | annotatorAgreementLabel=Annotator agreement
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | annotatorAgreementLabel=Annotator agreement
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | annotatorAgreementLabel=Annotator agreement
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | annotatorAgreementLabel=Annotator agreement
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | annotatorAgreementLabel=Annotator agreement
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | annotatorAgreementLabel=Annotator agreement
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | annotatorAgreementLabel=Annotator agreement
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | annotatorAgreementLabel=Annotator agreement
paper=R195113 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | annotatorAgreementLabel=Annotator agreement
paper=R1553533 | paperLabel=Automated Extraction and Clustering of Requirements Glossary | annotatorAgreementLabel=Annotator agreement
paper=R1554261 | paperLabel=Automated demarcation of requirements in textual specificati | annotatorAgreementLabel=Annotator agreement

---

49 rows; columns: paper, paperLabel, guidelineLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | guidelineLabel=No
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | guidelineLabel=Not reported
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | guidelineLabel=Not reported
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | guidelineLabel=No
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | guidelineLabel=Yes, via a non-persistent URL
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | guidelineLabel=No
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | guidelineLabel=Not reported
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | guidelineLabel=Not reported
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | guidelineLabel=Not reported
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | guidelineLabel=Not reported
paper=R195113 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | guidelineLabel=No
paper=R1553533 | paperLabel=Automated Extraction and Clustering of Requirements Glossary | guidelineLabel=Not reported

## Case 20

Question: Which research approaches (for example observational or experimental) do ecology and evolution studies use?

### Gold query

SELECT ?paper ?approach_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C65000 ; orkgp:HAS_APPROACH ?a . ?a rdfs:label ?approach_label . }

### Gold result (head)

142 rows; columns: paper, approach_label
paper=R651681 | approach_label=Synthetic approach
paper=R651694 | approach_label=Synthetic approach
paper=R653362 | approach_label=Synthetic approach
paper=R654244 | approach_label=Synthetic approach
paper=R654575 | approach_label=Synthetic approach
paper=R651937 | approach_label=Trait-based approach
paper=R652176 | approach_label=Canonical Correspondence Analysis (CCA)
paper=R653705 | approach_label=enemy release
paper=R653939 | approach_label=Predator/prey model
paper=R653985 | approach_label=Genetics
paper=R654139 | approach_label=herbivory rate
paper=R654518 | approach_label=herbivory rate

### Predicted query

# id: research_approaches

# Required ORKG prefixes

# Select each paper, its title, and the research approach it reports

SELECT ?paper ?paperLabel ?approachLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to template contribution instances

?contribution a orkgc:C65000 .

# Get the research approach(es) reported in the contribution

?contribution orkgp:HAS_APPROACH ?approach .

# Get the human-readable label of each research approach (e.g., observational, experimental)

?approach rdfs:label ?approachLabel .

# Get the title of the paper

?paper rdfs:label ?paperLabel .
}

# Order rows by paper so each paper's approaches are grouped together

ORDER BY ?paperLabel

### Predicted result (head)

142 rows; columns: paper, paperLabel, approachLabel
paper=R653362 | paperLabel=<scp>S</scp>pecies traits predict stream‐fish invaders in an | approachLabel=Synthetic approach
paper=R654139 | paperLabel=A global analysis of enemy release and its variation with la | approachLabel=herbivory rate
paper=R595694 | paperLabel=A global impact assessment of Acacia species introduced to S | approachLabel=literature review
paper=R595668 | paperLabel=A global meta-analysis of the ecological impacts of alien sp | approachLabel=meta-analysis
paper=R595721 | paperLabel=A new wave of marine fish invasions through the Panama and S | approachLabel=Observational approach
paper=R653939 | paperLabel=A novel metric reveals biotic resistance potential and infor | approachLabel=Predator/prey model
paper=R653939 | paperLabel=A novel metric reveals biotic resistance potential and infor | approachLabel=Modelling approach
paper=R651289 | paperLabel=Aboveground impacts of a belowground invader: how invasive e | approachLabel=Observational approach
paper=R595685 | paperLabel=Acquisition and evolution of enhanced mutualism—an underappr | approachLabel=Observational approach
paper=R595685 | paperLabel=Acquisition and evolution of enhanced mutualism—an underappr | approachLabel=Experimental approach
paper=R646992 | paperLabel=Alien and native plant species play different roles in plant | approachLabel=Observational approach
paper=R651616 | paperLabel=Alien plants can be associated with a decrease in local and | approachLabel=Observational approach

## Case 21

Question: What datasets exist for a certain NLP4RE task?

### Gold query

SELECT DISTINCT
?contribution
?paper
?paperLabel
?NLPTaskTypeLabel
?NLPdataItem
?dataProductionTime
?NLPdatasourceTypeLabel
?numberOfDatasources
?datasourceDomainLabel
?NLPdataFormatLabel
?rigorOfDataFormatLabel
?naturalLanguage
?licensePubliclyAvailableLabel
?licenseTypeLabel
?NLPdataset
?datasetLocationTypeLabel
?datasetURL
?NLPabstractionLevelLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001 ;
orkgp:P181003 ?NLPTask ;
orkgp:P181011 ?NLPdataset .

OPTIONAL {
?NLPTask orkgp:P181004 ?NLPTaskType .
?NLPTaskType rdfs:label ?NLPTaskTypeLabel .}

?NLPdataset orkgp:P181015 ?NLPdataItem ;
orkgp:P181016 ?dataProductionTime ;
orkgp:P181017 ?NLPdatasource ;
orkgp:P181021 ?NLPabstractionLevel ;
orkgp:P181022 ?NLPdatatype ;
orkgp:license ?license ;
orkgp:P181028 ?datasetLocation .

?NLPdatasource orkgp:P181018 ?NLPdatasourceType ;
orkgp:P181020 ?datasourceDomain .

OPTIONAL{?NLPdatasource orkgp:P181019 ?numberOfDatasources .}

OPTIONAL { ?NLPdatasourceType rdfs:label ?NLPdatasourceTypeLabel .
?datasourceDomain rdfs:label ?datasourceDomainLabel .
?NLPabstractionLevel rdfs:label ?NLPabstractionLevelLabel .}

?NLPdatatype orkgp:P181023 ?NLPdataFormat ;
orkgp:P181024 ?rigorOfDataFormat ;
orkgp:P181025 ?naturalLanguage .

OPTIONAL { ?NLPdataFormat rdfs:label ?NLPdataFormatLabel . }
OPTIONAL { ?rigorOfDataFormat rdfs:label ?rigorOfDataFormatLabel .}

?license orkgp:P181026 ?licensePubliclyAvailable ;
orkgp:P181027 ?licenseType .
OPTIONAL { ?licensePubliclyAvailable rdfs:label ?licensePubliclyAvailableLabel . }
OPTIONAL { ?licenseType rdfs:label ?licenseTypeLabel . }

?datasetLocation orkgp:P181030 ?datasetLocationType .
OPTIONAL { ?datasetLocationType rdfs:label ?datasetLocationTypeLabel . }
OPTIONAL { ?datasetLocation orkgp:P1003 ?datasetURL . }

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?contribution ?NLPTaskTypeLabel

### Gold result (head)

2196 rows; columns: contribution, paper, paperLabel, NLPTaskTypeLabel, NLPdataItem, dataProductionTime, NLPdatasourceTypeLabel, numberOfDatasources, datasourceDomainLabel, NLPdataFormatLabel, rigorOfDataFormatLabel, naturalLanguage, licensePubliclyAvailableLabel, licenseTypeLabel, NLPdataset, datasetLocationTypeLabel, datasetURL, NLPabstractionLevelLabel
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=transportation | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=engineering | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=communication | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=web applications | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=transportation | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=engineering | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=communication | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=web applications | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=transportation | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=engineering | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=communication | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=web applications | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level

### Predicted query

# id: datasets_per_nlp4re_task

# Declare the namespace prefixes required for this template

# Return each paper with its NLP dataset(s) and the RE/NLP task(s) they address

SELECT DISTINCT ?paper ?paperLabel ?reTaskLabel ?nlpTaskLabel ?datasetLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions that use the NLP4RE ID Card template

?contribution a orkgc:C121001 .

# Get the NLP dataset used by the contribution

?contribution orkgp:P181011 ?dataset .

# Get the human-readable name of the dataset

?dataset rdfs:label ?datasetLabel .

# Get the paper's title for display

OPTIONAL { ?paper rdfs:label ?paperLabel . }

# Get the requirements engineering task addressed by the study, if present

OPTIONAL {
?contribution orkgp:P181002 ?reTask .
?reTask rdfs:label ?reTaskLabel .
}

# Get the natural language processing task addressed by the study, if present

OPTIONAL {
?contribution orkgp:P181003 ?nlpTask .
?nlpTask rdfs:label ?nlpTaskLabel .
}

# To focus on one specific task, uncomment and adapt the filter below (case-insensitive)

# FILTER(LCASE(STR(?nlpTaskLabel)) = LCASE("requirements classification"))

}
ORDER BY ?paperLabel

### Predicted result (head)

49 rows; columns: paper, paperLabel, reTaskLabel, nlpTaskLabel, datasetLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | reTaskLabel=Requirements retrieval | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | reTaskLabel=Information extraction from legal documents | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | reTaskLabel=Requirements tracing | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | reTaskLabel=Information extraction from natural-langauge requirements sp | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | reTaskLabel=modeling language ambiguity | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | reTaskLabel=Model generation | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | reTaskLabel=Requirements defect detection | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | reTaskLabel=Requirements defect detection | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | reTaskLabel=Requirements retrieval | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | reTaskLabel=Requirements tracing | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R195113 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | reTaskLabel=Information extraction from legal documents | nlpTaskLabel=NLP task | datasetLabel=NLP dataset
paper=R1553533 | paperLabel=Automated Extraction and Clustering of Requirements Glossary | reTaskLabel=Information extraction from requirements | nlpTaskLabel=NLP task | datasetLabel=NLP dataset

## Case 22

Question: How often are which empirical methods used?

### Gold query

    SELECT ?paper, ?dc_method_type_label
            WHERE {
                    ?paper orkgp:P31 ?contribution;
                        orkgp:P29 ?year.
                    ?contribution a orkgc:C27001;
                                orkgp:P135046 ?serie.
                    ?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P56008 ?data_collection.
                            ?data_collection orkgp:P1005 ?dc_method;
                                            rdfs:label ?dc_label.
                            ?dc_method orkgp:P94003 ?dc_method_type.
                            ?dc_method_type rdfs:label ?dc_method_type_label.
                    }

                    FILTER(?dc_label != "no collection"^^xsd:string)
                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

---

        SELECT ?paper ?year ?da_label
        (SAMPLE(?descriptive) AS ?descriptive)
        (SAMPLE(?inferential) AS ?inferential)
        (SAMPLE(?machine_learning) AS ?machine_learning)
        (SAMPLE(?method) AS ?method)
        WHERE {
        ?paper orkgp:P31 ?contribution;
                orkgp:P29 ?year.

        ?contribution a orkgc:C27001;
                        orkgp:P135046 ?serie.

        ?serie rdfs:label ?venue_name.

        OPTIONAL {
                ?contribution orkgp:P15124 ?data_analysis.
                ?data_analysis rdfs:label ?da_label.

                OPTIONAL { ?data_analysis orkgp:P56048/rdfs:label ?descriptive. }
                OPTIONAL { ?data_analysis orkgp:P56043/rdfs:label ?inferential. }
                OPTIONAL { ?data_analysis orkgp:P57016/rdfs:label ?machine_learning. }
                OPTIONAL { ?data_analysis orkgp:P1005/rdfs:label ?method. }
        }

        FILTER(?da_label != "no analysis"^^xsd:string)
        FILTER(?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }
        GROUP BY ?paper ?year ?da_label

### Gold result (head)

978 rows; columns: paper, dc_method_type_label
paper=R108199 | dc_method_type_label=secondary research
paper=R108199 | dc_method_type_label=experiment
paper=R111988 | dc_method_type_label=secondary research
paper=R111988 | dc_method_type_label=experiment
paper=R112434 | dc_method_type_label=secondary research
paper=R113008 | dc_method_type_label=survey
paper=R113008 | dc_method_type_label=study
paper=R113067 | dc_method_type_label=secondary research
paper=R113160 | dc_method_type_label=secondary research
paper=R113204 | dc_method_type_label=experiment
paper=R74547 | dc_method_type_label=experiment
paper=R76792 | dc_method_type_label=secondary research

---

581 rows; columns: paper, year, da_label, descriptive, inferential, machine_learning, method
paper=R578027 | year=2006 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=comparative analysis
paper=R583218 | year=2004 | da_label=analysis | descriptive= | inferential= | machine_learning= | method=document matrix
paper=R225589 | year=2012 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=coding
paper=R583172 | year=2004 | da_label=analysis | descriptive=descriptive | inferential=inferential | machine_learning= | method=
paper=R1556972 | year=2025 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=pairwise kappa analysis
paper=R1543501 | year=2023 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=thematic analysis
paper=R194428 | year=2019 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=
paper=R597409 | year=2001 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=Component-Bus-System-Property approach
paper=R220364 | year=2013 | da_label=analysis | descriptive=descriptive | inferential=inferential | machine_learning=machine learning | method=
paper=R211438 | year=2014 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=
paper=R193798 | year=2021 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=Crowdsourcing
paper=R675312 | year=1996 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=grounded theory

### Predicted query

# id: data_collection_methods

# Namespace prefixes

SELECT ?paper ?paperLabel ?method_type_label ?method_name_label
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to instances of the template contribution class

?contribution a orkgc:C27001 .

# Get the paper's human-readable title

?paper rdfs:label ?paperLabel .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_name .

# Keep only the IEEE Requirements Engineering venue

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Go to the data collection node

?contribution orkgp:P56008 ?dc .

# Get the data collection label

?dc rdfs:label ?dc_label .

# Exclude papers without data collection

FILTER(LCASE(STR(?dc_label)) != LCASE("no collection"))

# Go to the data collection method node

?dc orkgp:P1005 ?method .

# Optionally get the general method type

OPTIONAL {
?method orkgp:P94003 ?mt .
?mt rdfs:label ?method_type_label .
}

# Optionally get the exact method name

OPTIONAL {
?method orkgp:P145012 ?mn .
?mn rdfs:label ?method_name_label .
}
}
ORDER BY ?paperLabel

---

# id: data_analysis_methods

# Namespace prefixes

SELECT ?paper ?paperLabel ?method_type_label ?analysis_technique_label
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to instances of the template contribution class

?contribution a orkgc:C27001 .

# Get the paper's human-readable title

?paper rdfs:label ?paperLabel .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_name .

# Keep only the IEEE Requirements Engineering venue

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Go to the data analysis node

?contribution orkgp:P15124 ?da .

# Get the data analysis label

?da rdfs:label ?da_label .

# Exclude papers without data analysis

FILTER(LCASE(STR(?da_label)) != LCASE("no analysis"))

# Go to the data analysis method node

?da orkgp:P1005 ?method .

# Optionally get the general method type

OPTIONAL {
?method orkgp:P94003 ?mt .
?mt rdfs:label ?method_type_label .
}

# Optionally get the specific analysis technique

OPTIONAL {
?method orkgp:P218006 ?at .
?at rdfs:label ?analysis_technique_label .
}
}
ORDER BY ?paperLabel

### Predicted result (head)

978 rows; columns: paper, paperLabel, method_type_label, method_name_label
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | method_type_label=case study | method_name_label=
paper=R227482 | paperLabel=A Case Study of Building Shared Understanding of Non-Functio | method_type_label=case study | method_name_label=
paper=R227482 | paperLabel=A Case Study of Building Shared Understanding of Non-Functio | method_type_label=interview | method_name_label=
paper=R227482 | paperLabel=A Case Study of Building Shared Understanding of Non-Functio | method_type_label=study | method_name_label=
paper=R195857 | paperLabel=A Case Study on Evaluating the Relevance of Some Rules for W | method_type_label=case study | method_name_label=
paper=R195857 | paperLabel=A Case Study on Evaluating the Relevance of Some Rules for W | method_type_label=survey | method_name_label=
paper=R195866 | paperLabel=A Case Study on a Specification Approach Using Activity Diag | method_type_label=case study | method_name_label=
paper=R195866 | paperLabel=A Case Study on a Specification Approach Using Activity Diag | method_type_label=survey | method_name_label=
paper=R1435100 | paperLabel=A Comparative Evaluation of Requirement Template Systems | method_type_label=secondary research | method_name_label=
paper=R1435100 | paperLabel=A Comparative Evaluation of Requirement Template Systems | method_type_label=experiment | method_name_label=
paper=R1471727 | paperLabel=A Data-Driven Approach for Finding Requirements Relevant Fee | method_type_label=secondary research | method_name_label=
paper=R227501 | paperLabel=A Divide & Concur Approach to Collaborative Goal Modeling wi | method_type_label=study | method_name_label=

---

579 rows; columns: paper, paperLabel, method_type_label, analysis_technique_label
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | method_type_label= | analysis_technique_label=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | method_type_label= | analysis_technique_label=
paper=R227482 | paperLabel=A Case Study of Building Shared Understanding of Non-Functio | method_type_label= | analysis_technique_label=
paper=R227482 | paperLabel=A Case Study of Building Shared Understanding of Non-Functio | method_type_label= | analysis_technique_label=
paper=R227482 | paperLabel=A Case Study of Building Shared Understanding of Non-Functio | method_type_label= | analysis_technique_label=
paper=R195866 | paperLabel=A Case Study on a Specification Approach Using Activity Diag | method_type_label= | analysis_technique_label=
paper=R1435100 | paperLabel=A Comparative Evaluation of Requirement Template Systems | method_type_label= | analysis_technique_label=
paper=R1471727 | paperLabel=A Data-Driven Approach for Finding Requirements Relevant Fee | method_type_label= | analysis_technique_label=
paper=R1471727 | paperLabel=A Data-Driven Approach for Finding Requirements Relevant Fee | method_type_label= | analysis_technique_label=
paper=R288443 | paperLabel=A Formal Approach to Semantic Composition of Aspect-Oriented | method_type_label= | analysis_technique_label=
paper=R108199 | paperLabel=A Little Bird Told Me: Mining Tweets for Requirements and So | method_type_label= | analysis_technique_label=
paper=R108199 | paperLabel=A Little Bird Told Me: Mining Tweets for Requirements and So | method_type_label= | analysis_technique_label=

## Case 23

Question: Which nutritional and metabolic diseases are studied most often?

### Gold query

SELECT ?paper ?disease_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C123091 ; orkgp:P134011 ?d . ?d rdfs:label ?disease_label . }

### Gold result (head)

727 rows; columns: paper, disease_label
paper=R1638119 | disease_label=Type 2 Diabetes
paper=R1699497 | disease_label=Colorectal adenoma
paper=R1638122 | disease_label=Type 2 Diabetes
paper=R1638125 | disease_label=Type 1 and Type 2 diabetes
paper=R1638129 | disease_label=Type 1 and Type 2 diabetes mellitus with diabetic nephropath
paper=R1638133 | disease_label=Type 1 and Type 2 diabetes mellitus with diabetic nephropath
paper=R1638136 | disease_label=Type 1 and Type 2 diabetes mellitus with diabetic nephropath
paper=R1638139 | disease_label=Type 2 diabetes mellitus with diabetic kidney disease
paper=R1638142 | disease_label=Type 2 Diabetes
paper=R1638153 | disease_label=Type 1 diabetes
paper=R1638156 | disease_label=Type 1 diabetes
paper=R1638160 | disease_label=Type 1 diabetes

### Predicted query

SELECT ?paper ?paperLabel ?diseaseLabel WHERE {
?paper orkgp:P31 ?contribution .
?contribution a orkgc:C123091 ;
orkgp:P134011 ?disease .
?paper rdfs:label ?paperLabel .
OPTIONAL { ?disease rdfs:label ?dl . }
BIND(COALESCE(?dl, ?disease) AS ?diseaseLabel)
}

### Predicted result (head)

727 rows; columns: paper, paperLabel, diseaseLabel
paper=R1638119 | paperLabel=Phytate and fiber content in Thai fruits commonly consumed b | diseaseLabel=Type 2 Diabetes
paper=R1638122 | paperLabel=The prevention and control the type-2 diabetes by changing l | diseaseLabel=Type 2 Diabetes
paper=R1638142 | paperLabel=Position of the Academy of Nutrition and Dietetics: The Role | diseaseLabel=Type 2 Diabetes
paper=R1638203 | paperLabel=High or low glycemic index (GI) meals at dinner results in g | diseaseLabel=Type 2 Diabetes
paper=R1638207 | paperLabel=Validation of the food insulin index in lean, young, healthy | diseaseLabel=Type 2 Diabetes
paper=R1638210 | paperLabel=Effects of Diet, Lifestyle, Chrononutrition and Alternative | diseaseLabel=Type 2 Diabetes
paper=R1638236 | paperLabel=Association of short-chain fatty acids and the gut microbiom | diseaseLabel=Type 2 Diabetes
paper=R1638256 | paperLabel=Gut bacteria selectively promoted by dietary fibers alleviat | diseaseLabel=Type 2 Diabetes
paper=R1638259 | paperLabel=Additional Effect of Dietary Fiber in Patients with Type 2 D | diseaseLabel=Type 2 Diabetes
paper=R1638263 | paperLabel=A dietary intervention with functional foods reduces metabol | diseaseLabel=Type 2 Diabetes
paper=R1638267 | paperLabel=Host–microbiome interactions in human type 2 diabetes follow | diseaseLabel=Type 2 Diabetes
paper=R1638270 | paperLabel=Modulation of gut microbiota dysbioses in type 2 diabetic pa | diseaseLabel=Type 2 Diabetes

## Case 24

Question: How many time series does each wind energy assessment use?

### Gold query

SELECT ?paper ?n_series WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C92000 ; orkgp:P149067 ?q . ?q orkgp:P45075 ?n_series . }

### Gold result (head)

143 rows; columns: paper, n_series
paper=R705188 | n_series=1
paper=R705198 | n_series=2
paper=R705211 | n_series=60
paper=R705221 | n_series=4
paper=R705236 | n_series=1
paper=R705566 | n_series=9
paper=R705585 | n_series=2
paper=R705610 | n_series=5
paper=R706033 | n_series=1
paper=R707161 | n_series=1
paper=R707402 | n_series=3
paper=R707435 | n_series=89

### Predicted query

SELECT ?paper ?paperLabel ?numberOfTimeSeries WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C92000 .
?contribution orkgp:P149067 ?qv .
?qv orkgp:P45075 ?numberOfTimeSeries .
?paper rdfs:label ?paperLabel .
}

### Predicted result (head)

143 rows; columns: paper, paperLabel, numberOfTimeSeries
paper=R705236 | paperLabel=Assessment and Analysis of Wind Power Resource Using Weibull | numberOfTimeSeries=1
paper=R705221 | paperLabel=A new approach to estimate the Weibull parameters for wind e | numberOfTimeSeries=4
paper=R705211 | paperLabel=A novel method developed to estimate Weibull parameters | numberOfTimeSeries=60
paper=R703061 | paperLabel=A wind energy integration analysis using wind resource asses | numberOfTimeSeries=1
paper=R705585 | paperLabel=An alternative distribution to Weibull for modeling the wind | numberOfTimeSeries=2
paper=R708241 | paperLabel=Analysis of some flexible families of distributions for esti | numberOfTimeSeries=4
paper=R708252 | paperLabel=Estimation methods review and analysis of offshore extreme w | numberOfTimeSeries=4
paper=R708260 | paperLabel=Wind speed probability distribution estimation and wind ener | numberOfTimeSeries=4
paper=R708270 | paperLabel=Comparison of seven methods for determining the optimal stat | numberOfTimeSeries=3
paper=R708294 | paperLabel=Estimating wind speed probability distribution by diffusion- | numberOfTimeSeries=6
paper=R708307 | paperLabel=A Multivariate and Multimodal Wind Distribution model | numberOfTimeSeries=2
paper=R708327 | paperLabel=Comprehensive evaluation of wind speed distribution models: | numberOfTimeSeries=5

## Case 25

Question: In which countries are the described ecological study systems located?

### Gold query

SELECT ?paper ?country_label WHERE { ?paper orkgp:P31 ?c . ?c orkgp:P115000 ?s . ?s a orkgc:C65002 ; orkgp:P37524 ?k . ?k rdfs:label ?country_label . }

### Gold result (head)

9 rows; columns: paper, country_label
paper=R171893 | country_label=New Zealand
paper=R651289 | country_label=Canada
paper=R651616 | country_label=New Zealand
paper=R595468 | country_label=United States of America
paper=R602669 | country_label=New Zealand
paper=R640475 | country_label=Germany
paper=R646693 | country_label=New Zealand
paper=R646992 | country_label=New Zealand
paper=R646999 | country_label=Germany

### Predicted query

SELECT ?paper ?paperLabel ?country ?countryLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C65002 .
?contribution orkgp:P37524 ?country .
?country rdfs:label ?countryLabel .
?paper rdfs:label ?paperLabel .
}

### Predicted result (head)

1 rows; columns: paper, paperLabel, country, countryLabel
paper=R651631 | paperLabel=Exotic fishes that are phylogenetically close but functional | country=R651804 | countryLabel=Sweden

## Case 26

Question: How has the proportion of empirical methods to conduct (systematic literature) reviews, so-called secondary research, evolved over time?

### Gold query

    SELECT ?paper, ?year, ?dc_method_type_label, ?dc_method_name
        WHERE {
                ?paper orkgp:P31 ?contribution;
                       orkgp:P29 ?year.
                ?contribution a orkgc:C27001;
                              orkgp:P135046 ?serie.
                ?serie rdfs:label ?venue_name.

                ?contribution orkgp:P56008 ?data_collection.
                ?data_collection orkgp:P1005 ?dc_method;
                                 rdfs:label ?dc_label.
                ?dc_method orkgp:P94003 ?dc_method_type;
                           orkgp:P145012 ?dc_method_name.
                ?dc_method_type rdfs:label ?dc_method_type_label.

                FILTER(?dc_method_type_label = "secondary research"^^xsd:string)
                #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }

### Gold result (head)

116 rows; columns: paper, year, dc_method_type_label, dc_method_name
paper=R713795 | year=1994 | dc_method_type_label=secondary research | dc_method_name=literature review
paper=R713795 | year=1994 | dc_method_type_label=secondary research | dc_method_name=tool review
paper=R734867 | year=1994 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1374601 | year=1993 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1471727 | year=2023 | dc_method_type_label=secondary research | dc_method_name=market research and analysis
paper=R1556242 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556399 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556659 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556702 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556727 | year=2025 | dc_method_type_label=secondary research | dc_method_name=systematic literature review
paper=R1556727 | year=2025 | dc_method_type_label=secondary research | dc_method_name=archive analysis
paper=R1556765 | year=2025 | dc_method_type_label=secondary research | dc_method_name=literature review

### Predicted query

# id: secondary_research_proportion_over_time

# Declare namespace prefixes required for ORKG queries

SELECT ?paper ?paperLabel ?year ?dc_label ?da_label
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of the template's contribution class

?contribution a orkgc:C27001 .

# Get the paper title for row identification

?paper rdfs:label ?paperLabel .

# Get the publication year from the paper (needed for the temporal analysis)

?paper orkgp:P29 ?year .

# Venue: restrict to the IEEE RE conference

?contribution orkgp:P135046 ?venue .

# Get the venue label to compare against the conference name

?venue rdfs:label ?venue_name .

# Case-insensitive match on the venue name

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Data collection: get the reported data collection node

?contribution orkgp:P56008 ?dc .

# Get the label of the data collection node (e.g., secondary research / literature review types)

?dc rdfs:label ?dc_label .

# Exclude papers without data collection

FILTER(LCASE(STR(?dc_label)) != LCASE("no collection"))

# Data analysis: get the reported data analysis node

?contribution orkgp:P15124 ?da .

# Get the label of the data analysis node

?da rdfs:label ?da_label .

# Exclude papers without data analysis

FILTER(LCASE(STR(?da_label)) != LCASE("no analysis"))
}

# Order rows chronologically so the proportion trend can be read over time

ORDER BY ?year

### Predicted result (head)

577 rows; columns: paper, paperLabel, year, dc_label, da_label
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | dc_label=collection | da_label=analysis
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | dc_label=collection | da_label=analysis
paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | year=1993 | dc_label=collection | da_label=analysis
paper=R1374618 | paperLabel=Dealing with performance requirements during the development | year=1993 | dc_label=collection | da_label=analysis
paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | year=1993 | dc_label=collection | da_label=analysis
paper=R1387388 | paperLabel=Process knowledge based rapid prototyping for requirements e | year=1993 | dc_label=collection | da_label=analysis
paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | year=1993 | dc_label=collection | da_label=analysis
paper=R1388590 | paperLabel=Requirements engineering by example: an empirical study | year=1993 | dc_label=collection | da_label=analysis
paper=R708774 | paperLabel=A case study of applying rapid prototyping techniques in the | year=1994 | dc_label=collection | da_label=analysis
paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | year=1994 | dc_label=collection | da_label=analysis
paper=R713795 | paperLabel=An analysis of the requirements traceability problem | year=1994 | dc_label=collection | da_label=analysis
paper=R716507 | paperLabel=Deriving human-error tolerance requirements from tasks | year=1994 | dc_label=collection | da_label=analysis

## Case 27

Question: What datasets exist for a certain NLP4RE task?

### Gold query

SELECT DISTINCT
?contribution
?paper
?paperLabel
?NLPTaskTypeLabel
?NLPdataItem
?dataProductionTime
?NLPdatasourceTypeLabel
?numberOfDatasources
?datasourceDomainLabel
?NLPdataFormatLabel
?rigorOfDataFormatLabel
?naturalLanguage
?licensePubliclyAvailableLabel
?licenseTypeLabel
?NLPdataset
?datasetLocationTypeLabel
?datasetURL
?NLPabstractionLevelLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001 ;
orkgp:P181003 ?NLPTask ;
orkgp:P181011 ?NLPdataset .

OPTIONAL {
?NLPTask orkgp:P181004 ?NLPTaskType .
?NLPTaskType rdfs:label ?NLPTaskTypeLabel .}

?NLPdataset orkgp:P181015 ?NLPdataItem ;
orkgp:P181016 ?dataProductionTime ;
orkgp:P181017 ?NLPdatasource ;
orkgp:P181021 ?NLPabstractionLevel ;
orkgp:P181022 ?NLPdatatype ;
orkgp:license ?license ;
orkgp:P181028 ?datasetLocation .

?NLPdatasource orkgp:P181018 ?NLPdatasourceType ;
orkgp:P181020 ?datasourceDomain .

OPTIONAL{?NLPdatasource orkgp:P181019 ?numberOfDatasources .}

OPTIONAL { ?NLPdatasourceType rdfs:label ?NLPdatasourceTypeLabel .
?datasourceDomain rdfs:label ?datasourceDomainLabel .
?NLPabstractionLevel rdfs:label ?NLPabstractionLevelLabel .}

?NLPdatatype orkgp:P181023 ?NLPdataFormat ;
orkgp:P181024 ?rigorOfDataFormat ;
orkgp:P181025 ?naturalLanguage .

OPTIONAL { ?NLPdataFormat rdfs:label ?NLPdataFormatLabel . }
OPTIONAL { ?rigorOfDataFormat rdfs:label ?rigorOfDataFormatLabel .}

?license orkgp:P181026 ?licensePubliclyAvailable ;
orkgp:P181027 ?licenseType .
OPTIONAL { ?licensePubliclyAvailable rdfs:label ?licensePubliclyAvailableLabel . }
OPTIONAL { ?licenseType rdfs:label ?licenseTypeLabel . }

?datasetLocation orkgp:P181030 ?datasetLocationType .
OPTIONAL { ?datasetLocationType rdfs:label ?datasetLocationTypeLabel . }
OPTIONAL { ?datasetLocation orkgp:P1003 ?datasetURL . }

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?contribution ?NLPTaskTypeLabel

### Gold result (head)

2196 rows; columns: contribution, paper, paperLabel, NLPTaskTypeLabel, NLPdataItem, dataProductionTime, NLPdatasourceTypeLabel, numberOfDatasources, datasourceDomainLabel, NLPdataFormatLabel, rigorOfDataFormatLabel, naturalLanguage, licensePubliclyAvailableLabel, licenseTypeLabel, NLPdataset, datasetLocationTypeLabel, datasetURL, NLPabstractionLevelLabel
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=transportation | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=engineering | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=communication | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=web applications | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=transportation | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=engineering | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=communication | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Classification | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=The dataset was publicly available but not anymore | numberOfDatasources=11 | datasourceDomainLabel=web applications | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=transportation | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=engineering | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=communication | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | NLPTaskTypeLabel=Information extraction | NLPdataItem=11 requirements documents with a total of 26829 sentences. T | dataProductionTime=Between 2000 and 2010 | NLPdatasourceTypeLabel=Industrial project, proprietary data | numberOfDatasources=11 | datasourceDomainLabel=web applications | NLPdataFormatLabel="Shall" requirements | rigorOfDataFormatLabel=Unconstrained natural language | naturalLanguage=English | licensePubliclyAvailableLabel=No | licenseTypeLabel=Not reported | NLPdataset=R1544466 | datasetLocationTypeLabel=Not reported | datasetURL= | NLPabstractionLevelLabel=System-level

### Predicted query

# id: datasets_per_nlp_task

# Return the paper, its NLP task type, and the dataset(s) used for that task

# Select the paper, its title, the NLP task type label, and the dataset label

SELECT ?paper ?paperLabel ?nlp_task_typeLabel ?datasetLabel
WHERE {

# Link the paper to its template contribution

?paper orkgp:P31 ?contribution .

# Restrict to instances of the NLP4RE ID Card contribution class

?contribution a orkgc:C121001 .

# Get the paper's title

?paper rdfs:label ?paperLabel .

# Follow the NLP task subtemplate

?contribution orkgp:P181003 ?nlpTask .

# Optionally get the NLP task type under the NLP task

OPTIONAL {
?nlpTask orkgp:P181004 ?nlp_task_type .
?nlp_task_type rdfs:label ?nlp_task_typeLabel .
}

# Get the NLP dataset used by the contribution

?contribution orkgp:P181011 ?dataset .

# Get the dataset's human-readable name

?dataset rdfs:label ?datasetLabel .
}

# Sort results by task type and then by dataset name

ORDER BY ?nlp_task_typeLabel ?datasetLabel

### Predicted result (head)

67 rows; columns: paper, paperLabel, nlp_task_typeLabel, datasetLabel
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R1547377 | paperLabel=Extracting software product line feature models from natural | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R78371 | paperLabel=Automatic Classification of Non-Functional Requirements from | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R193929 | paperLabel=NoRBERT: Transfer learning for requirements classification | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R194610 | paperLabel=Requirements Classification with Interpretable Machine Learn | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R194610 | paperLabel=Requirements Classification with Interpretable Machine Learn | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R194884 | paperLabel=Extraction of System States from Natural Language Requiremen | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R211380 | paperLabel=Hidden in plain sight: Automatically identifying security re | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R1553362 | paperLabel=On the automatic classification of app reviews | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset
paper=R1553393 | paperLabel=Extracting Arguments Based on User Decisions in App Reviews | nlp_task_typeLabel=Classification | datasetLabel=NLP dataset

## Case 28

Question: How has the reporting of threats to validity evolved over time?

### Gold query

        SELECT ?paper ?year
        (SAMPLE(?external) AS ?external)
        (SAMPLE(?internal) AS ?internal)
        (SAMPLE(?construct) AS ?construct)
        (SAMPLE(?conclusion) AS ?conclusion)
        (SAMPLE(?reliability) AS ?reliability)
        (SAMPLE(?generalizability) AS ?generalizability)
        (SAMPLE(?content) AS ?content)
        (SAMPLE(?descriptive) AS ?descriptive)
        (SAMPLE(?theoretical) AS ?theoretical)
        (SAMPLE(?repeatability) AS ?repeatability)
        (SAMPLE(?mentioned) AS ?mentioned)
        WHERE {
        ?paper orkgp:P31 ?contribution;
                orkgp:P29 ?year.
        ?contribution a orkgc:C27001;
                        orkgp:P135046 ?serie.
        ?serie rdfs:label ?venue_name.

        OPTIONAL {
        ?contribution orkgp:P39099 ?threats.
        OPTIONAL { ?threats orkgp:P55034 ?external. }
        OPTIONAL { ?threats orkgp:P55035 ?internal. }
        OPTIONAL { ?threats orkgp:P55037 ?construct. }
        OPTIONAL { ?threats orkgp:P55036 ?conclusion. }
        OPTIONAL { ?threats orkgp:P59109 ?reliability. }
        OPTIONAL { ?threats orkgp:P60006 ?generalizability. }
        OPTIONAL { ?threats orkgp:P68005 ?content. }
        OPTIONAL { ?threats orkgp:P97000 ?descriptive. }
        OPTIONAL { ?threats orkgp:P97001 ?theoretical. }
        OPTIONAL { ?threats orkgp:P97002 ?repeatability. }
        OPTIONAL { ?threats orkgp:P145000 ?mentioned. }
        }
        FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }
        GROUP BY ?paper ?year

### Gold result (head)

776 rows; columns: paper, year, external, internal, construct, conclusion, reliability, generalizability, content, descriptive, theoretical, repeatability, mentioned
paper=R587110 | year=2003 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R587153 | year=2002 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R644464 | year=1997 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R200061 | year=2015 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=1
paper=R1552227 | year=2024 | external=1 | internal=1 | construct=1 | conclusion=1 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R196009 | year=2017 | external=1 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R603589 | year=1998 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R276045 | year=2011 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=1
paper=R211428 | year=2014 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R597102 | year=2001 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0
paper=R1556727 | year=2025 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=1
paper=R285805 | year=2008 | external=0 | internal=0 | construct=0 | conclusion=0 | reliability=0 | generalizability=0 | content=0 | descriptive=0 | theoretical=0 | repeatability=0 | mentioned=0

### Predicted query

# id: threats_to_validity_by_year

# Standard ORKG prefix block

# Return each paper's title, publication year, and reported threat-to-validity categories

SELECT ?paper ?paperLabel ?year ?validityType ?validityTypeLabel ?answerLabel
WHERE {

# Get the publication year, which is a property of the paper

?paper orkgp:P29 ?year .

# Get the paper's title label

?paper rdfs:label ?paperLabel .

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of the Empirical Research Practice template

?contribution a orkgc:C27001 .

# Traverse to the threat to validity subtemplate

?contribution orkgp:P39099 ?tv .

# Iterate over the threat-to-validity category predicates

VALUES ?validityType {
orkgp:P55037 # construct validity
orkgp:P55035 # internal validity
orkgp:P55034 # external validity
orkgp:P55036 # conclusion validity
orkgp:P59109 # reliability
orkgp:P60006 # generalizability
orkgp:P97002 # repeatability
orkgp:P68005 # content validity
orkgp:P97000 # descriptive validity
orkgp:P97001 # theoretical validity
orkgp:P145000 # mentioned (not classified)
}

# Get the reported value for each validity category

?tv ?validityType ?answer .

# Get the human-readable name of the validity category

?validityType rdfs:label ?validityTypeLabel .

# Get the answer label where the value is a resource

OPTIONAL { ?answer rdfs:label ?answerLabel }
}
ORDER BY ?year ?paperLabel

### Predicted result (head)

8547 rows; columns: paper, paperLabel, year, validityType, validityTypeLabel, answerLabel
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P55037 | validityTypeLabel=construct validity | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P55034 | validityTypeLabel=external validity | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P55035 | validityTypeLabel=internal validity | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P55036 | validityTypeLabel=conclusion validity | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P59109 | validityTypeLabel=reliability | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P60006 | validityTypeLabel=generalizability | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P68005 | validityTypeLabel=content validity | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P97002 | validityTypeLabel=repeatability | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P97000 | validityTypeLabel=descriptive validity | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P97001 | validityTypeLabel=theoretical validity | answerLabel=
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | validityType=http://orkg.org/orkg/predicate/P145000 | validityTypeLabel=mentioned | answerLabel=
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | validityType=http://orkg.org/orkg/predicate/P55037 | validityTypeLabel=construct validity | answerLabel=

## Case 29

Question: How have the proportions of experiments, secondary research (reviews), surveys, case studies, and action research in the empirical methods used evolved over time?

### Gold query

    SELECT ?paper, ?year, ?dc_method_type_label
            WHERE {
                    ?paper orkgp:P31 ?contribution;
                        orkgp:P29 ?year.
                    ?contribution a orkgc:C27001;
                                orkgp:P135046 ?serie.
                    ?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P56008 ?data_collection.
                            ?data_collection orkgp:P1005 ?dc_method;
                                            rdfs:label ?dc_label.
                            ?dc_method orkgp:P94003 ?dc_method_type.
                            ?dc_method_type rdfs:label ?dc_method_type_label.
                    }

                    FILTER(?dc_label != "no collection"^^xsd:string)
                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

978 rows; columns: paper, year, dc_method_type_label
paper=R108199 | year=2017 | dc_method_type_label=secondary research
paper=R108199 | year=2017 | dc_method_type_label=experiment
paper=R111988 | year=2016 | dc_method_type_label=secondary research
paper=R111988 | year=2016 | dc_method_type_label=experiment
paper=R112434 | year=2017 | dc_method_type_label=secondary research
paper=R113008 | year=2017 | dc_method_type_label=survey
paper=R113008 | year=2017 | dc_method_type_label=study
paper=R113067 | year=2017 | dc_method_type_label=secondary research
paper=R113160 | year=2018 | dc_method_type_label=secondary research
paper=R113204 | year=2018 | dc_method_type_label=experiment
paper=R74547 | year=2016 | dc_method_type_label=experiment
paper=R76792 | year=2017 | dc_method_type_label=secondary research

### Predicted query

# id: method_proportions_over_time

# Required ORKG prefixes for this query

# Return one row per paper and data collection label, with publication year for the temporal breakdown

SELECT ?paper ?paperLabel ?year ?dc_label
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to instances of the template contribution class

?contribution a orkgc:C27001 .

# Get the paper's human-readable title

?paper rdfs:label ?paperLabel .

# Get the publication year from the paper (not the contribution)

?paper orkgp:P29 ?year .

# Reach the data collection instance of the contribution

?contribution orkgp:P56008 ?data_collection .

# Get the label of the data collection instance (e.g., experiment, survey, case study)

?data_collection rdfs:label ?dc_label .

# Exclude non-empirical papers with no data collection (case-insensitive)

FILTER(LCASE(STR(?dc_label)) != LCASE("no collection"))
}

# Sort by year ascending, then by paper title, so the processing step can compute proportions per year

ORDER BY ?year ?paperLabel

### Predicted result (head)

608 rows; columns: paper, paperLabel, year, dc_label
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | dc_label=collection
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | dc_label=collection
paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | year=1993 | dc_label=collection
paper=R1374618 | paperLabel=Dealing with performance requirements during the development | year=1993 | dc_label=collection
paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | year=1993 | dc_label=collection
paper=R1387388 | paperLabel=Process knowledge based rapid prototyping for requirements e | year=1993 | dc_label=collection
paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | year=1993 | dc_label=collection
paper=R1388590 | paperLabel=Requirements engineering by example: an empirical study | year=1993 | dc_label=collection
paper=R708774 | paperLabel=A case study of applying rapid prototyping techniques in the | year=1994 | dc_label=collection
paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | year=1994 | dc_label=collection
paper=R713795 | paperLabel=An analysis of the requirements traceability problem | year=1994 | dc_label=collection
paper=R716507 | paperLabel=Deriving human-error tolerance requirements from tasks | year=1994 | dc_label=collection

## Case 30

Question: How have the proportions of case studies and action research in the empirical methods used evolved over time?

### Gold query

    SELECT ?paper, ?year, ?dc_method_type_label
            WHERE {
                    ?paper orkgp:P31 ?contribution;
                        orkgp:P29 ?year.
                    ?contribution a orkgc:C27001;
                                orkgp:P135046 ?serie.
                    ?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P56008 ?data_collection.
                            ?data_collection orkgp:P1005 ?dc_method;
                                            rdfs:label ?dc_label.
                            ?dc_method orkgp:P94003 ?dc_method_type.
                            ?dc_method_type rdfs:label ?dc_method_type_label.
                    }

                    FILTER(?dc_label != "no collection"^^xsd:string)
                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

978 rows; columns: paper, year, dc_method_type_label
paper=R108199 | year=2017 | dc_method_type_label=secondary research
paper=R108199 | year=2017 | dc_method_type_label=experiment
paper=R111988 | year=2016 | dc_method_type_label=secondary research
paper=R111988 | year=2016 | dc_method_type_label=experiment
paper=R112434 | year=2017 | dc_method_type_label=secondary research
paper=R113008 | year=2017 | dc_method_type_label=survey
paper=R113008 | year=2017 | dc_method_type_label=study
paper=R113067 | year=2017 | dc_method_type_label=secondary research
paper=R113160 | year=2018 | dc_method_type_label=secondary research
paper=R113204 | year=2018 | dc_method_type_label=experiment
paper=R74547 | year=2016 | dc_method_type_label=experiment
paper=R76792 | year=2017 | dc_method_type_label=secondary research

### Predicted query

# id: case_study_action_research_trend

# Select paper, publication year, and the label of each data collection method type used

SELECT ?paper ?paperLabel ?year ?methodTypeLabel
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to template contribution instances

?contribution a orkgc:C27001 .

# Get the publication year from the paper

?paper orkgp:P29 ?year .

# Get the paper label for counting per paper

?paper rdfs:label ?paperLabel .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_name .

# Keep only the IEEE International Requirements Engineering Conference

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Reach the data collection node

?contribution orkgp:P56008 ?dataCollection .

# Reach the data collection method nodes

?dataCollection orkgp:P1005 ?method .

# Reach the method type node for each method

?method orkgp:P94003 ?methodType .

# Get the human-readable label of the method type

?methodType rdfs:label ?methodTypeLabel .

# Keep only case study and action research method types (case-insensitive)

FILTER(LCASE(STR(?methodTypeLabel)) IN (LCASE("case study"), LCASE("action research")))
}
ORDER BY ?year ?paperLabel

### Predicted result (head)

252 rows; columns: paper, paperLabel, year, methodTypeLabel
paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | year=1993 | methodTypeLabel=case study
paper=R708774 | paperLabel=A case study of applying rapid prototyping techniques in the | year=1994 | methodTypeLabel=case study
paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | year=1994 | methodTypeLabel=case study
paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | year=1994 | methodTypeLabel=case study
paper=R724132 | paperLabel=Supporting multi-perspective requirements engineering | year=1994 | methodTypeLabel=case study
paper=R725768 | paperLabel=The directorate information system at St Thomas' hospital: a | year=1994 | methodTypeLabel=case study
paper=R725892 | paperLabel=Towards a system for the construction, clarification, discov | year=1994 | methodTypeLabel=case study
paper=R680008 | paperLabel=A field study of requirements engineering practices in infor | year=1995 | methodTypeLabel=case study
paper=R678968 | paperLabel=A task centered approach to analysing human error tolerance | year=1995 | methodTypeLabel=case study
paper=R680028 | paperLabel=An evaluation of inquiry-based requirements analysis for an | year=1995 | methodTypeLabel=case study
paper=R680050 | paperLabel=Goal-directed elaboration of requirements for a meeting sche | year=1995 | methodTypeLabel=case study
paper=R684287 | paperLabel=Implementing requirements traceability: a case study | year=1995 | methodTypeLabel=case study

## Case 31

Question: How has the provision of data (the materials used, raw data collected, and study results identified) evolved over time?

### Gold query

    SELECT ?paper, ?year, ?data, ?url
            WHERE {
                    ?paper orkgp:P31 ?contribution;
                        orkgp:P29 ?year.
                    ?contribution a orkgc:C27001;
                                orkgp:P135046 ?serie.
                    ?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P56008 ?data_collection.
                            ?data_collection rdfs:label ?dc_label.
                            OPTIONAL{?data_collection orkgp:DATA ?data.
                                    OPTIONAL{?data orkgp:url ?url.}
                                    }
                    }

                    FILTER(?dc_label != "no collection"^^xsd:string)
                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

690 rows; columns: paper, year, data, url
paper=R113008 | year=2017 | data=R195503 | url=https://www.lancaster.ac.uk/staff/chopraak/canary/index.html
paper=R113067 | year=2017 | data=R195543 | url=https://github.com/aesuli/Amazon-downloader
paper=R113067 | year=2017 | data=R195543 | url=https://mast.informatik.uni-hamburg.de/app-review-analysis/
paper=R113160 | year=2018 | data=R202183 | url=http://www.cs.ucl.ac.uk/staff/F.Sarro/projects/UCLappA/home.
paper=R113204 | year=2018 | data=R202185 | url=https://sites.google.com/view/clapprojsite
paper=R76792 | year=2017 | data=R195474 | url=http://seel.cse.lsu.edu/data/re17.zip
paper=R76818 | year=2018 | data=R195140 | url=https://mast.informatik.uni-hamburg.de/app-review-analysis/
paper=R78392 | year=2015 | data=R199170 | url=http://mobis.informatik.uni-hamburg.de/app-review-analysis/
paper=R78432 | year=2016 | data=R198943 | url=https://zenodo.org/record/56907
paper=R596028 | year=2001 | data=R596031 | url=http://www.ida.liu.se/-parca/interdependencies.html
paper=R597400 | year=2001 | data=R597405 | url=http://sra.itc.it/tools/t-tool/
paper=R597409 | year=2001 | data=R597412 | url=http://www.groupsystems.com/

### Predicted query

# id: data_provision_over_time

# Namespace declarations

SELECT ?paper ?paperLabel ?year ?dc_label ?rq_answer_label
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to template contribution instances

?contribution a orkgc:C27001 .

# Get the paper title

?paper rdfs:label ?paperLabel .

# Get the publication year (a property of the paper, used for the temporal trend)

?paper orkgp:P29 ?year .

# Restrict to the IEEE International Requirements Engineering Conference

?contribution orkgp:P135046 ?venue .
?venue rdfs:label ?venue_label .
FILTER(LCASE(STR(?venue_label)) = LCASE("IEEE International Requirements Engineering Conference"))

# Get the data collection instance (covers materials used and raw data collected)

?contribution orkgp:P56008 ?data_collection .
?data_collection rdfs:label ?dc_label .

# Exclude non-empirical papers that report no data collection

FILTER(LCASE(STR(?dc_label)) != LCASE("no collection"))

# Optionally get the reported research question answer (study results identified)

OPTIONAL {
?contribution orkgp:P57004 ?rq_answer .
?rq_answer rdfs:label ?rq_answer_label .
}
}
ORDER BY ?year ?paperLabel

### Predicted result (head)

607 rows; columns: paper, paperLabel, year, dc_label, rq_answer_label
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R1374618 | paperLabel=Dealing with performance requirements during the development | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R1387388 | paperLabel=Process knowledge based rapid prototyping for requirements e | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R1388590 | paperLabel=Requirements engineering by example: an empirical study | year=1993 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R708774 | paperLabel=A case study of applying rapid prototyping techniques in the | year=1994 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | year=1994 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R713795 | paperLabel=An analysis of the requirements traceability problem | year=1994 | dc_label=collection | rq_answer_label=Research Question Answer
paper=R716507 | paperLabel=Deriving human-error tolerance requirements from tasks | year=1994 | dc_label=collection | rq_answer_label=Research Question Answer

## Case 32

Question: Which countries are covered by wind energy potential assessments, and how many studies per country?

### Gold query

SELECT ?paper ?country_label WHERE { ?paper orkgp:P31 ?c . ?c a orkgc:C92000 ; <http://orkg.org/orkg/predicate/wikidata:P17> ?k . ?k rdfs:label ?country_label . }

### Gold result (head)

151 rows; columns: paper, country_label
paper=R705188 | country_label=Morocco
paper=R705198 | country_label=Turkey
paper=R705211 | country_label=Pakistan
paper=R705221 | country_label=India
paper=R705236 | country_label=Saudi Arabia
paper=R705585 | country_label=Turkey
paper=R705610 | country_label=Iran
paper=R706033 | country_label=Cameroon
paper=R707161 | country_label=Cameroon
paper=R707402 | country_label=Turkey
paper=R707412 | country_label=Italy
paper=R707435 | country_label=France

### Predicted query

SELECT ?paper ?paperLabel ?countryLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C92000 .
?contribution orkgp:P15249 ?country .
?country rdfs:label ?countryLabel .
?paper rdfs:label ?paperLabel .
}

### Predicted result (head)

0 rows; columns: paper, paperLabel, countryLabel

## Case 33

Question: Which papers are associated with annotation guidelines?

### Gold query

SELECT DISTINCT ?paper ?year ?paperLabel ?guidelineAvailabilityLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:P181031 ?annotationProcess .
?paper orkgp:P29 ?year .

    ?annotationProcess orkgp:P181036 ?annotationScheme .
    ?annotationScheme orkgp:P181038 ?guidelineAvailability .


    OPTIONAL {?paper rdfs:label ?paperLabel .}
    OPTIONAL {?guidelineAvailability rdfs:label ?guidelineAvailabilityLabel .}

}ORDER BY ?paperLabel

### Gold result (head)

49 rows; columns: paper, year, paperLabel, guidelineAvailabilityLabel
paper=R194345 | year=2019 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | guidelineAvailabilityLabel=No
paper=R1547354 | year=2019 | paperLabel=A Query System for Extracting Requirements-Related Informati | guidelineAvailabilityLabel=Not reported
paper=R1553443 | year=2012 | paperLabel=A semantic relatedness approach for traceability link recove | guidelineAvailabilityLabel=Not reported
paper=R1553474 | year=2019 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | guidelineAvailabilityLabel=No
paper=R1547319 | year=2019 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | guidelineAvailabilityLabel=Yes, via a non-persistent URL
paper=R1553463 | year=2019 | paperLabel=An empirical study on the potential usefulness of domain mod | guidelineAvailabilityLabel=No
paper=R1553463 | year=2019 | paperLabel=An empirical study on the potential usefulness of domain mod | guidelineAvailabilityLabel=Not reported
paper=R1544459 | year=2011 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | guidelineAvailabilityLabel=Not reported
paper=R1554249 | year=2017 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | guidelineAvailabilityLabel=Not reported
paper=R220364 | year=2013 | paperLabel=Application of reinforcement learning to requirements engine | guidelineAvailabilityLabel=Not reported
paper=R195113 | year=2018 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | guidelineAvailabilityLabel=No
paper=R1553533 | year=2017 | paperLabel=Automated Extraction and Clustering of Requirements Glossary | guidelineAvailabilityLabel=Not reported

### Predicted query

# id: papers_with_annotation_guidelines

# Namespace declarations for ORKG resources, predicates, and classes

# Select distinct papers with their title and the guideline availability value

SELECT DISTINCT ?paper ?paperLabel ?guidelineLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to NLP4RE ID Card contributions

?contribution a orkgc:C121001 .

# Go from the contribution to its annotation process

?contribution orkgp:P181031 ?annotationProcess .

# Go from the annotation process to its annotation scheme

?annotationProcess orkgp:P181036 ?annotationScheme .

# Go from the annotation scheme to its guideline availability value

?annotationScheme orkgp:P181038 ?guideline .

# Get the human-readable label of the guideline availability value

?guideline rdfs:label ?guidelineLabel .

# Get the paper title as a readable label

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?paperLabel

### Predicted result (head)

49 rows; columns: paper, paperLabel, guidelineLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | guidelineLabel=No
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | guidelineLabel=Not reported
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | guidelineLabel=Not reported
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | guidelineLabel=No
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | guidelineLabel=Yes, via a non-persistent URL
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | guidelineLabel=No
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | guidelineLabel=Not reported
paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | guidelineLabel=Not reported
paper=R1554249 | paperLabel=Analysis of Online Discussions in Support of Requirements Di | guidelineLabel=Not reported
paper=R220364 | paperLabel=Application of reinforcement learning to requirements engine | guidelineLabel=Not reported
paper=R195113 | paperLabel=Automated Extraction of Semantic Legal Metadata using Natura | guidelineLabel=No
paper=R1553533 | paperLabel=Automated Extraction and Clustering of Requirements Glossary | guidelineLabel=Not reported

## Case 34

Question: How has the reporting of research questions and answers evolved over time?

### Gold query

    SELECT ?paper, ?year, ?question, ?highlighted_q, ?highlighted_a
            WHERE {
                    ?paper orkgp:P31 ?contribution;
                        orkgp:P29 ?year.
                    ?contribution a orkgc:C27001;
                                orkgp:P135046 ?serie.
                    ?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P37330 ?rq.
                            OPTIONAL{?rq orkgp:P44139 ?question.}
                            OPTIONAL{?rq orkgp:P55039 ?highlighted_q.}
                    }
                    OPTIONAL{?contribution orkgp:P57004 ?answer.
                            OPTIONAL{?answer orkgp:P55039 ?highlighted_a.}
                    }

                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

1328 rows; columns: paper, year, question, highlighted_q, highlighted_a
paper=R108199 | year=2017 | question=How accurate are machine learning techniques when automatica | highlighted_q=1 | highlighted_a=0
paper=R108199 | year=2017 | question=How accurate is topic modeling for grouping tweets about sof | highlighted_q=1 | highlighted_a=0
paper=R108199 | year=2017 | question=How accurate is our ranking approach compared to the assessm | highlighted_q=1 | highlighted_a=0
paper=R108199 | year=2017 | question=Are the results from topic modeling coherent according to t | highlighted_q=0 | highlighted_a=0
paper=R111988 | year=2016 | question=What are the relevant characteristics of the tweets in terms | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=What type of content is present in tweets related to softwar | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=Is the content relevant to software application stakeholders | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=What are the attitudes that users have when writing about sp | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=What is the performance of supervised machine learning techn | highlighted_q=1 | highlighted_a=0
paper=R112434 | year=2017 | question=What quality aspects of software products are raised by user | highlighted_q=1 | highlighted_a=0
paper=R112434 | year=2017 | question=How should language patterns be defined so that quality aspe | highlighted_q=1 | highlighted_a=0
paper=R113008 | year=2017 | question=What is the quality of the crowd-acquired annotations? | highlighted_q=1 | highlighted_a=0

### Predicted query

# id: rq_answer_reporting_over_time

# Namespace declarations

# Select one row per paper and year with the reporting attributes of its research question and answer

SELECT ?paper ?paperLabel ?year
(SAMPLE(?rqText) AS ?rq)
(SAMPLE(?rqHiddenLabel) AS ?rqHidden)
(SAMPLE(?rqHighlightedLabel) AS ?rqHighlighted)
(SAMPLE(?ansHiddenLabel) AS ?ansHidden)
(SAMPLE(?ansHighlightedLabel) AS ?ansHighlighted)
WHERE {

# Publication year belongs to the paper (needed for the temporal analysis)

?paper orkgp:P29 ?year .

# Paper label for display

?paper rdfs:label ?paperLabel .

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to template contribution class

?contribution a orkgc:C27001 .

# Venue filter: restrict to the IEEE RE conference

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_name .

# Case-insensitive venue match

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Research question block (optional, not every paper reports one)

OPTIONAL { # Go to the research question subtemplate
?contribution orkgp:P37330 ?rq . # Get the research question text node
?rq orkgp:P44139 ?rqQuestion . # Get the label of the question if it is a resource
OPTIONAL { ?rqQuestion rdfs:label ?rqQLabel } # Is the research question hidden in the text?
OPTIONAL {
?rq orkgp:P55038 ?rqHid .
?rqHid rdfs:label ?rqHiddenLabel .
} # Is the research question highlighted in the text?
OPTIONAL {
?rq orkgp:P55039 ?rqHgh .
?rqHgh rdfs:label ?rqHighlightedLabel .
}
}

# Use the question label if available, otherwise the raw literal value

BIND(COALESCE(?rqQLabel, STR(?rqQuestion)) AS ?rqText)

# Research question answer block (optional)

OPTIONAL { # Go to the research question answer subtemplate
?contribution orkgp:P57004 ?ans . # Is the answer hidden in the text?
OPTIONAL {
?ans orkgp:P55038 ?ansHid .
?ansHid rdfs:label ?ansHiddenLabel .
} # Is the answer highlighted in the text?
OPTIONAL {
?ans orkgp:P55039 ?ansHgh .
?ansHgh rdfs:label ?ansHighlightedLabel .
}
}
}

# One row per paper

GROUP BY ?paper ?paperLabel ?year

# Order chronologically, then by paper title

ORDER BY ?year ?paperLabel

### Predicted result (head)

776 rows; columns: paper, paperLabel, year, rq, rqHidden, rqHighlighted, ansHidden, ansHighlighted
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R752108 | paperLabel=An incremental integration tool between requirements enginee | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1374618 | paperLabel=Dealing with performance requirements during the development | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R759344 | paperLabel=Defaults in specifications | year=1993 | rq=Can we make sense of such defaults in specifications? | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1355372 | paperLabel=Description of specification developments | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1355793 | paperLabel=Documentation of requirements for computer systems | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1355398 | paperLabel=Domain descriptions | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1385593 | paperLabel=Domain modelling with hierarchies of alternative viewpoints | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1385604 | paperLabel=Formally specifying temporal constraints and error recovery | year=1993 | rq=No question | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=
paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | year=1993 | rq=What are the problems which arise from interdisciplinary wor | rqHidden= | rqHighlighted= | ansHidden= | ansHighlighted=

## Case 35

Question: What are top-3 most frequently used evaluation metrics to assess a developed NLP approach?

### Gold query

SELECT DISTINCT ?paper ?paperLabel ?evaluation_metricLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:HAS_EVALUATION ?evaluation .
?evaluation orkgp:P110006 ?evaluation_metric .

OPTIONAL {?paper rdfs:label ?paperLabel .}
OPTIONAL {?evaluation_metric rdfs:label ?evaluation_metricLabel .}
} ORDER BY ?paperLabel

### Gold result (head)

116 rows; columns: paper, paperLabel, evaluation_metricLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | evaluation_metricLabel=Precision/Recall
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | evaluation_metricLabel=Accuracy
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | evaluation_metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=LAG
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=MAP
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=DiffAR
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=Precision/Recall
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=AUC
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=Accuracy
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=F-Score
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | evaluation_metricLabel=kendall's tau

### Predicted query

# id: top3_evaluation_metrics

# Declare the ORKG prefixes used in this query

# Return one row per paper and evaluation metric so the top 3 can be counted downstream

SELECT DISTINCT ?paper ?paperLabel ?evaluation_metricLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions that are instances of the NLP4RE ID Card template class

?contribution a orkgc:C121001 .

# Follow the evaluation branch of the contribution

?contribution orkgp:HAS_EVALUATION ?evaluation .

# Get the evaluation metrics attached to the evaluation

?evaluation orkgp:P110006 ?evaluation_metric .

# Get the human-readable label of each metric

?evaluation_metric rdfs:label ?evaluation_metricLabel .

# Get the paper's label for display and grouping

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}
ORDER BY ?paperLabel

### Predicted result (head)

116 rows; columns: paper, paperLabel, evaluation_metricLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | evaluation_metricLabel=Precision/Recall
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | evaluation_metricLabel=Accuracy
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | evaluation_metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=LAG
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=MAP
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=DiffAR
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=Precision/Recall
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=AUC
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=Accuracy
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=F-Score
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | evaluation_metricLabel=kendall's tau

## Case 36

Question: What are top-3 most frequently used evaluation metrics to assess a developed NLP approach?

### Gold query

SELECT DISTINCT ?paper ?paperLabel ?evaluation_metricLabel
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:HAS_EVALUATION ?evaluation .
?evaluation orkgp:P110006 ?evaluation_metric .

OPTIONAL {?paper rdfs:label ?paperLabel .}
OPTIONAL {?evaluation_metric rdfs:label ?evaluation_metricLabel .}
} ORDER BY ?paperLabel

### Gold result (head)

116 rows; columns: paper, paperLabel, evaluation_metricLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | evaluation_metricLabel=Precision/Recall
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | evaluation_metricLabel=Accuracy
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | evaluation_metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=LAG
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=MAP
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | evaluation_metricLabel=DiffAR
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=Precision/Recall
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=AUC
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=Accuracy
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | evaluation_metricLabel=F-Score
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | evaluation_metricLabel=kendall's tau

### Predicted query

# id: top3_evaluation_metrics

# Declare standard ORKG prefixes

# Select each paper, its label, and the evaluation metric label, without duplicates

SELECT DISTINCT ?paper ?paperLabel ?metricLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions that are instances of the NLP4RE ID Card template class

?contribution a orkgc:C121001 .

# Access the evaluation subtemplate of the contribution

?contribution orkgp:HAS_EVALUATION ?evaluation .

# Access the evaluation metric attached to the evaluation

?evaluation orkgp:P110006 ?metric .

# Get the human-readable label of the metric

?metric rdfs:label ?metricLabel .

# Get the paper's label for counting and display (optional)

OPTIONAL { ?paper rdfs:label ?paperLabel . }
}

# Order by paper so that all metric rows per paper are grouped together

ORDER BY ?paperLabel

### Predicted result (head)

116 rows; columns: paper, paperLabel, metricLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | metricLabel=Precision/Recall
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | metricLabel=Accuracy
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | metricLabel=Precision/Recall
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | metricLabel=LAG
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | metricLabel=MAP
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | metricLabel=DiffAR
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | metricLabel=Precision/Recall
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | metricLabel=AUC
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | metricLabel=Accuracy
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | metricLabel=F-Score
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | metricLabel=kendall's tau

## Case 37

Question: How often are which empirical methods used over time?

### Gold query

    SELECT ?paper, ?year, ?dc_method_type_label
        WHERE {
                ?paper orkgp:P31 ?contribution;
                       orkgp:P29 ?year.
                ?contribution a orkgc:C27001;
                              orkgp:P135046 ?serie.
                ?serie rdfs:label ?venue_name.

                OPTIONAL{?contribution orkgp:P56008 ?data_collection.
                         ?data_collection orkgp:P1005 ?dc_method;
                                          rdfs:label ?dc_label.
                         ?dc_method orkgp:P94003 ?dc_method_type.
                         ?dc_method_type rdfs:label ?dc_method_type_label.
                }

                FILTER(?dc_label != "no collection"^^xsd:string)
                #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }

---

    SELECT DISTINCT ?paper ?year ?da_label
                (SAMPLE(?descriptive) AS ?descriptive)
                (SAMPLE(?inferential) AS ?inferential)
                (SAMPLE(?machine_learning) AS ?machine_learning)
                (SAMPLE(?method) AS ?method)
        WHERE {
        ?paper orkgp:P31 ?contribution;
                orkgp:P29 ?year.

        ?contribution a orkgc:C27001;
                        orkgp:P135046 ?serie;
                        orkgp:P15124 ?data_analysis.

        ?data_analysis rdfs:label ?da_label.

        OPTIONAL { ?data_analysis orkgp:P56048/rdfs:label ?descriptive. }
        OPTIONAL { ?data_analysis orkgp:P56043/rdfs:label ?inferential. }
        OPTIONAL { ?data_analysis orkgp:P57016/rdfs:label ?machine_learning. }
        OPTIONAL { ?data_analysis orkgp:P1005/rdfs:label ?method. }

        ?serie rdfs:label ?venue_name.

        FILTER(?da_label != "no analysis"^^xsd:string)
        FILTER(?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
        }
        GROUP BY ?paper ?year ?da_label

### Gold result (head)

978 rows; columns: paper, year, dc_method_type_label
paper=R108199 | year=2017 | dc_method_type_label=secondary research
paper=R108199 | year=2017 | dc_method_type_label=experiment
paper=R111988 | year=2016 | dc_method_type_label=secondary research
paper=R111988 | year=2016 | dc_method_type_label=experiment
paper=R112434 | year=2017 | dc_method_type_label=secondary research
paper=R113008 | year=2017 | dc_method_type_label=survey
paper=R113008 | year=2017 | dc_method_type_label=study
paper=R113067 | year=2017 | dc_method_type_label=secondary research
paper=R113160 | year=2018 | dc_method_type_label=secondary research
paper=R113204 | year=2018 | dc_method_type_label=experiment
paper=R74547 | year=2016 | dc_method_type_label=experiment
paper=R76792 | year=2017 | dc_method_type_label=secondary research

---

581 rows; columns: paper, year, da_label, descriptive, inferential, machine_learning, method
paper=R578027 | year=2006 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=comparative analysis
paper=R583218 | year=2004 | da_label=analysis | descriptive= | inferential= | machine_learning= | method=document matrix
paper=R225589 | year=2012 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=coding
paper=R583172 | year=2004 | da_label=analysis | descriptive=descriptive | inferential=inferential | machine_learning= | method=
paper=R1556972 | year=2025 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=pairwise kappa analysis
paper=R1543501 | year=2023 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=thematic analysis
paper=R194428 | year=2019 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=
paper=R597409 | year=2001 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=Component-Bus-System-Property approach
paper=R220364 | year=2013 | da_label=analysis | descriptive=descriptive | inferential=inferential | machine_learning=machine learning | method=
paper=R211438 | year=2014 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=
paper=R193798 | year=2021 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning=machine learning | method=Crowdsourcing
paper=R675312 | year=1996 | da_label=analysis | descriptive=descriptive | inferential= | machine_learning= | method=grounded theory

### Predicted query

# id: empirical_methods_over_time

# Declare common prefixes for ORKG resources, classes, predicates, and XSD types

# Select the paper, its title, publication year, and the data collection label (method)

SELECT ?paper ?paperLabel ?year ?dc_label WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to template contribution instances

?contribution a orkgc:C27001 .

# Get the paper title

?paper rdfs:label ?paperLabel .

# Get the publication year (a property of the paper, needed for the over-time analysis)

?paper orkgp:P29 ?year .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_label .

# Keep only the IEEE International Requirements Engineering Conference

FILTER(LCASE(STR(?venue_label)) = LCASE("IEEE International Requirements Engineering Conference"))

# Get the data collection node (the empirical method reported)

?contribution orkgp:P56008 ?dc .

# Get the human-readable label of the data collection method

?dc rdfs:label ?dc_label .

# Exclude non-empirical papers without data collection

FILTER(LCASE(STR(?dc_label)) != LCASE("no collection"))
}
ORDER BY ?year ?paperLabel

### Predicted result (head)

607 rows; columns: paper, paperLabel, year, dc_label
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | dc_label=collection
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | dc_label=collection
paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | year=1993 | dc_label=collection
paper=R1374618 | paperLabel=Dealing with performance requirements during the development | year=1993 | dc_label=collection
paper=R1385617 | paperLabel=Integrating ethnography into the requirements engineering pr | year=1993 | dc_label=collection
paper=R1387388 | paperLabel=Process knowledge based rapid prototyping for requirements e | year=1993 | dc_label=collection
paper=R1387406 | paperLabel=Requirements capture as a cooperative activity | year=1993 | dc_label=collection
paper=R1388590 | paperLabel=Requirements engineering by example: an empirical study | year=1993 | dc_label=collection
paper=R708774 | paperLabel=A case study of applying rapid prototyping techniques in the | year=1994 | dc_label=collection
paper=R712785 | paperLabel=AbstFinder, a prototype abstraction finder for natural langu | year=1994 | dc_label=collection
paper=R713795 | paperLabel=An analysis of the requirements traceability problem | year=1994 | dc_label=collection
paper=R716507 | paperLabel=Deriving human-error tolerance requirements from tasks | year=1994 | dc_label=collection

## Case 38

Question: Which combinations of RE and NLP tasks are most (a)typical?

### Gold query

SELECT DISTINCT ?contribution ?paper ?paperLabel ?RETaskLabel ?NLPTaskTypeLabel ?NLPTaskTypeDescription
WHERE {
?paper orkgp:P31 ?contribution .
?contribution rdf:type orkgc:C121001;
orkgp:P181002 ?RETask;
orkgp:P181003 ?NLPTask .

    ?NLPTask orkgp:P181004 ?NLPTaskType .
    OPTIONAL{?NLPTaskType orkgp:description ?NLPTaskTypeDescription .}

    OPTIONAL { ?paper rdfs:label ?paperLabel . }
    OPTIONAL { ?RETask rdfs:label ?RETaskLabel . }
    OPTIONAL { ?NLPTaskType rdfs:label ?NLPTaskTypeLabel . }

}
ORDER BY ?contribution ?paperLabel ?NLPTaskTypeLabel

### Gold result (head)

67 rows; columns: contribution, paper, paperLabel, RETaskLabel, NLPTaskTypeLabel, NLPTaskTypeDescription
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | RETaskLabel=Requirements defect detection | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1544461 | paper=R1544459 | paperLabel=Analysing anaphoric ambiguity in natural language requiremen | RETaskLabel=Requirements defect detection | NLPTaskTypeLabel=Information extraction | NLPTaskTypeDescription=glossary, terms
contribution=R1544545 | paper=R194610 | paperLabel=Requirements Classification with Interpretable Machine Learn | RETaskLabel=Requirements classification | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | RETaskLabel=modeling language ambiguity | NLPTaskTypeLabel=Information retrieval | NLPTaskTypeDescription=search / rank
contribution=R1547321 | paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | RETaskLabel=modeling language ambiguity | NLPTaskTypeLabel=language modeling | NLPTaskTypeDescription=
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | RETaskLabel=Information extraction from legal documents | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | RETaskLabel=Information extraction from legal documents | NLPTaskTypeLabel=Information extraction | NLPTaskTypeDescription=glossary, terms
contribution=R1547356 | paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | RETaskLabel=Information extraction from legal documents | NLPTaskTypeLabel=Information retrieval | NLPTaskTypeDescription=search / rank
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Information extraction | NLPTaskTypeDescription=glossary, terms
contribution=R1547380 | paper=R1547377 | paperLabel=Extracting software product line feature models from natural | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Translation | NLPTaskTypeDescription=models, tests, etc.
contribution=R1552264 | paper=R1553393 | paperLabel=Extracting Arguments Based on User Decisions in App Reviews | RETaskLabel=Information extraction from requirements | NLPTaskTypeLabel=Classification | NLPTaskTypeDescription=choose among classes

### Predicted query

# id: re_nlp_task_combinations

# Return each paper with its RE task and NLP task type so that RE/NLP task pairs can be counted

SELECT ?paper ?paperLabel ?re_taskLabel ?nlp_task_typeLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions that use the NLP4RE ID Card template class

?contribution a orkgc:C121001 .

# Get the paper's label for display

?paper rdfs:label ?paperLabel .

# Get the RE task addressed by the study

?contribution orkgp:P181002 ?re_task .

# Get the human-readable label of the RE task

?re_task rdfs:label ?re_taskLabel .

# Traverse to the NLP task subtemplate

?contribution orkgp:P181003 ?nlp_task .

# Traverse from the NLP task to its task type

?nlp_task orkgp:P181004 ?nlp_task_type .

# Get the human-readable label of the NLP task type

?nlp_task_type rdfs:label ?nlp_task_typeLabel .
}

# Order by paper so that all paper-pair rows stay grouped for frequency counting

ORDER BY ?paperLabel

### Predicted result (head)

67 rows; columns: paper, paperLabel, re_taskLabel, nlp_task_typeLabel
paper=R194345 | paperLabel=A Machine Learning-Based Approach for Demarcating Requiremen | re_taskLabel=Requirements retrieval | nlp_task_typeLabel=Classification
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | re_taskLabel=Information extraction from legal documents | nlp_task_typeLabel=Information retrieval
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | re_taskLabel=Information extraction from legal documents | nlp_task_typeLabel=Information extraction
paper=R1547354 | paperLabel=A Query System for Extracting Requirements-Related Informati | re_taskLabel=Information extraction from legal documents | nlp_task_typeLabel=Classification
paper=R1553443 | paperLabel=A semantic relatedness approach for traceability link recove | re_taskLabel=Requirements tracing | nlp_task_typeLabel=Information retrieval
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | re_taskLabel=Information extraction from natural-langauge requirements sp | nlp_task_typeLabel=Information extraction
paper=R1553474 | paperLabel=An Active Learning Approach for Improving the Accuracy of Au | re_taskLabel=Information extraction from natural-langauge requirements sp | nlp_task_typeLabel=Classification
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | re_taskLabel=modeling language ambiguity | nlp_task_typeLabel=language modeling
paper=R1547319 | paperLabel=An NLP approach for cross-domain ambiguity detection in requ | re_taskLabel=modeling language ambiguity | nlp_task_typeLabel=Information retrieval
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | re_taskLabel=Model generation | nlp_task_typeLabel=Translation
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | re_taskLabel=Model generation | nlp_task_typeLabel=Information extraction
paper=R1553463 | paperLabel=An empirical study on the potential usefulness of domain mod | re_taskLabel=Requirements defect detection | nlp_task_typeLabel=Classification

## Case 39

Question: What types of threats to validity do the authors report?

### Gold query

    SELECT ?paper, ?year, ?External, ?Internal, ?Construct, ?Conclusion, ?Reliability, ?Generalizability, ?Content, ?Descriptive, ?Theoretical, ?Repeatability, ?Mentioned
            WHERE {
                    ?paper orkgp:P31 ?contribution;
                            orkgp:P29 ?year.
                    ?contribution a orkgc:C27001;
                                    orkgp:P135046 ?serie.
                    ?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P39099 ?threats.
                            OPTIONAL{?threats orkgp:P55034 ?External.}
                            OPTIONAL{?threats orkgp:P55035 ?Internal.}
                            OPTIONAL{?threats orkgp:P55037 ?Construct.}
                            OPTIONAL{?threats orkgp:P55036 ?Conclusion.}
                            OPTIONAL{?threats orkgp:P59109 ?Reliability.}
                            OPTIONAL{?threats orkgp:P60006 ?Generalizability.}
                            OPTIONAL{?threats orkgp:P68005 ?Content.}
                            OPTIONAL{?threats orkgp:P97000 ?Descriptive.}
                            OPTIONAL{?threats orkgp:P97001 ?Theoretical.}
                            OPTIONAL{?threats orkgp:P97002 ?Repeatability.}
                            OPTIONAL{?threats orkgp:P145000 ?Mentioned}
                    }

                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

776 rows; columns: paper, year, External, Internal, Construct, Conclusion, Reliability, Generalizability, Content, Descriptive, Theoretical, Repeatability, Mentioned
paper=R108199 | year=2017 | External=1 | Internal=0 | Construct=0 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R111988 | year=2016 | External=1 | Internal=1 | Construct=1 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R112434 | year=2017 | External=1 | Internal=1 | Construct=1 | Conclusion=1 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R113008 | year=2017 | External=0 | Internal=1 | Construct=0 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R113067 | year=2017 | External=0 | Internal=0 | Construct=0 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=1
paper=R113160 | year=2018 | External=1 | Internal=0 | Construct=1 | Conclusion=1 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R113204 | year=2018 | External=0 | Internal=0 | Construct=0 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=1
paper=R74547 | year=2016 | External=1 | Internal=1 | Construct=1 | Conclusion=1 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R76792 | year=2017 | External=1 | Internal=1 | Construct=1 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R76818 | year=2018 | External=0 | Internal=0 | Construct=1 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R78392 | year=2015 | External=1 | Internal=1 | Construct=0 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0
paper=R78432 | year=2016 | External=1 | Internal=1 | Construct=0 | Conclusion=0 | Reliability=0 | Generalizability=0 | Content=0 | Descriptive=0 | Theoretical=0 | Repeatability=0 | Mentioned=0

### Predicted query

# id: threats_to_validity_types

# Standard ORKG prefixes

# Return the paper, its label, the threat-to-validity category, and the reported value

SELECT ?paper ?paperLabel ?threatType ?threatValue ?threatValueLabel
WHERE {

# Link the paper to its contribution

?paper orkgp:P31 ?contribution .

# Restrict to template instances of the Empirical Research Practice contribution class

?contribution a orkgc:C27001 .

# Get the paper's human-readable label

?paper rdfs:label ?paperLabel .

# Get the venue of the contribution

?contribution orkgp:P135046 ?venue .

# Get the venue label

?venue rdfs:label ?venue_name .

# Keep only the IEEE International Requirements Engineering Conference

FILTER(LCASE(STR(?venue_name)) = LCASE("IEEE International Requirements Engineering Conference"))

# Access the threat to validity subtemplate of the contribution

?contribution orkgp:P39099 ?threats .

# Check each threat-to-validity category predicate (construct, internal, external, conclusion, reliability, generalizability, repeatability, content, descriptive, theoretical, and mentioned-but-unclassified)

VALUES ?threatProperty {
orkgp:P55037
orkgp:P55035
orkgp:P55034
orkgp:P55036
orkgp:P59109
orkgp:P60006
orkgp:P97002
orkgp:P68005
orkgp:P97000
orkgp:P97001
orkgp:P145000
}

# Get the value reported for each threat category that is present

?threats ?threatProperty ?threatValue .

# Get the readable name of the threat category

?threatProperty rdfs:label ?threatType .

# Get the label of the reported value when it is a resource

OPTIONAL { ?threatValue rdfs:label ?threatValueLabel }
}
ORDER BY ?paperLabel ?threatType

### Predicted result (head)

8536 rows; columns: paper, paperLabel, threatType, threatValue, threatValueLabel
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=conclusion validity | threatValue=0 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=construct validity | threatValue=1 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=content validity | threatValue=0 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=descriptive validity | threatValue=0 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=external validity | threatValue=1 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=generalizability | threatValue=0 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=internal validity | threatValue=1 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=mentioned | threatValue=0 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=reliability | threatValue=1 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=repeatability | threatValue=0 | threatValueLabel=
paper=R556363 | paperLabel=A Case Study in Systematic Improvement of Language for Requi | threatType=theoretical validity | threatValue=0 | threatValueLabel=
paper=R227482 | paperLabel=A Case Study of Building Shared Understanding of Non-Functio | threatType=conclusion validity | threatValue=0 | threatValueLabel=

## Case 40

Question: How has the reporting of research questions and answers evolved over time?

### Gold query

    SELECT ?paper, ?year, ?question, ?highlighted_q, ?highlighted_a
            WHERE {
                    ?paper orkgp:P31 ?contribution;
                        orkgp:P29 ?year.
                    ?contribution a orkgc:C27001;
                                orkgp:P135046 ?serie.
                    ?serie rdfs:label ?venue_name.

                    OPTIONAL{?contribution orkgp:P37330 ?rq.
                            OPTIONAL{?rq orkgp:P44139 ?question.}
                            OPTIONAL{?rq orkgp:P55039 ?highlighted_q.}
                    }
                    OPTIONAL{?contribution orkgp:P57004 ?answer.
                            OPTIONAL{?answer orkgp:P55039 ?highlighted_a.}
                    }

                    #FILTER(xsd:integer(?year) > "1999"^^xsd:integer)
                    FILTER (?venue_name = "IEEE International Requirements Engineering Conference"^^xsd:string)
            }

### Gold result (head)

1328 rows; columns: paper, year, question, highlighted_q, highlighted_a
paper=R108199 | year=2017 | question=How accurate are machine learning techniques when automatica | highlighted_q=1 | highlighted_a=0
paper=R108199 | year=2017 | question=How accurate is topic modeling for grouping tweets about sof | highlighted_q=1 | highlighted_a=0
paper=R108199 | year=2017 | question=How accurate is our ranking approach compared to the assessm | highlighted_q=1 | highlighted_a=0
paper=R108199 | year=2017 | question=Are the results from topic modeling coherent according to t | highlighted_q=0 | highlighted_a=0
paper=R111988 | year=2016 | question=What are the relevant characteristics of the tweets in terms | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=What type of content is present in tweets related to softwar | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=Is the content relevant to software application stakeholders | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=What are the attitudes that users have when writing about sp | highlighted_q=1 | highlighted_a=0
paper=R111988 | year=2016 | question=What is the performance of supervised machine learning techn | highlighted_q=1 | highlighted_a=0
paper=R112434 | year=2017 | question=What quality aspects of software products are raised by user | highlighted_q=1 | highlighted_a=0
paper=R112434 | year=2017 | question=How should language patterns be defined so that quality aspe | highlighted_q=1 | highlighted_a=0
paper=R113008 | year=2017 | question=What is the quality of the crowd-acquired annotations? | highlighted_q=1 | highlighted_a=0

### Predicted query

# id: rq_answer_reporting_over_time

# Namespace prefixes

# Return each paper with its publication year and how its research questions and answers are reported

SELECT ?paper ?paperLabel ?year ?questionText ?questionHidden ?questionHighlighted ?answerHidden ?answerHighlighted
WHERE {

# Link the paper to its empirical research practice contribution

?paper orkgp:P31 ?contribution .

# Restrict to contributions of the Empirical Research Practice template

?contribution a orkgc:C27001 .

# Get the publication year of the paper (temporal dimension)

?paper orkgp:P29 ?year .

# Get the paper title for display

?paper rdfs:label ?paperLabel .

# Research question branch (optional so papers without it still appear)

OPTIONAL { # Reach the research question subtemplate
?contribution orkgp:P37330 ?rqTemplate . # Get the research question text
OPTIONAL { ?rqTemplate orkgp:P44139 ?questionText . } # Get whether the research question is hidden in the text (label of the value)
OPTIONAL {
?rqTemplate orkgp:P55038 ?hiddenNode .
?hiddenNode rdfs:label ?questionHidden .
} # Get whether the research question is highlighted in the text (label of the value)
OPTIONAL {
?rqTemplate orkgp:P55039 ?highlightedNode .
?highlightedNode rdfs:label ?questionHighlighted .
}
}

# Research question answer branch (optional so papers without it still appear)

OPTIONAL { # Reach the research question answer subtemplate
?contribution orkgp:P57004 ?answerTemplate . # Get whether the answer is hidden in the text (label of the value)
OPTIONAL {
?answerTemplate orkgp:P55038 ?answerHiddenNode .
?answerHiddenNode rdfs:label ?answerHidden .
} # Get whether the answer is highlighted in the text (label of the value)
OPTIONAL {
?answerTemplate orkgp:P55039 ?answerHighlightedNode .
?answerHighlightedNode rdfs:label ?answerHighlighted .
}
}
}

# Order results chronologically, then by paper title

ORDER BY ?year ?paperLabel

### Predicted result (head)

1331 rows; columns: paper, paperLabel, year, questionText, questionHidden, questionHighlighted, answerHidden, answerHighlighted
paper=R742443 | paperLabel=A review of the state of the practice in requirements modeli | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R752003 | paperLabel=A translation method from natural language specifications in | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R752108 | paperLabel=An incremental integration tool between requirements enginee | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R1374601 | paperLabel=Analyzing software requirements errors in safety-critical, e | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R1374618 | paperLabel=Dealing with performance requirements during the development | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R759344 | paperLabel=Defaults in specifications | year=1993 | questionText=Can we make sense of such defaults in specifications? | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R759344 | paperLabel=Defaults in specifications | year=1993 | questionText=How formally can we allow one partially to override another, | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R759344 | paperLabel=Defaults in specifications | year=1993 | questionText=How do we know what should override what, anyway? | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R1355372 | paperLabel=Description of specification developments | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R1355793 | paperLabel=Documentation of requirements for computer systems | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R1355398 | paperLabel=Domain descriptions | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
paper=R1385593 | paperLabel=Domain modelling with hierarchies of alternative viewpoints | year=1993 | questionText=No question | questionHidden= | questionHighlighted= | answerHidden= | answerHighlighted=
