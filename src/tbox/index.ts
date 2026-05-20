/**
 * Project TBox Bundle (IMPLEMENTATION_PLAN.md section 1.2)
 *
 * SPEC refs: section 5.14, NFR-014, section 31 items 2 and 4.
 *
 * getProjectTBoxTurtle() returns the TBox as Turtle text for prepending
 *   to Turtle/N-Triples exports (SPEC section 31 items 2 and 4).
 * getProjectTBoxNodes() returns the TBox as JSON-LD node objects for
 *   @graph insertion in the semantic JSON-LD export (SPEC section 6.3 step 5).
 *
 * Both functions are pure: no I/O, no side effects, same value on every call.
 */

// ---------------------------------------------------------------------------
// Normative Turtle (SPEC section 5.14 block, verbatim)
// ---------------------------------------------------------------------------

const PROJECT_TBOX_TURTLE = `@prefix ecm:  <https://edgecanonical.org/ns/modeler#> .
@prefix iao:  <http://purl.obolibrary.org/obo/iao#> .
@prefix cco:  <https://www.commoncoreontologies.org/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# Realist anchoring of the Ontology Design Pattern concept
iao:OntologyDesignPattern  a            owl:Class ;
                           rdfs:label   "Ontology Design Pattern" ;
                           rdfs:comment "An Information Content Entity that represents a portion of reality that is the subject of one or more data points and is encoded in a repeatable machine-interpretable format using elements from an ontology." ;
                           rdfs:subClassOf cco:ont00000958 .

# Every project is an Ontology Design Pattern
ecm:Project                a            owl:Class ;
                           rdfs:label   "Visual Modeler Project" ;
                           rdfs:subClassOf iao:OntologyDesignPattern .

# Serializations are concrete ICEs of a project
ecm:Serialization          a            owl:Class ;
                           rdfs:label   "Project Serialization" ;
                           rdfs:comment "An Information Content Entity that is a concrete encoding of a project (Ontology Design Pattern) in a specific representational format." ;
                           rdfs:subClassOf cco:ont00000958 .

# Object property linking serializations to their source project
ecm:isSerializationOf      a            owl:ObjectProperty ;
                           rdfs:label   "is serialization of" ;
                           rdfs:domain  ecm:Serialization ;
                           rdfs:range   iao:OntologyDesignPattern .

# Placeholder subject class used during onboarding
ecm:UnspecifiedSubjectMatter a          owl:Class ;
                             rdfs:label "Unspecified Subject Matter" ;
                             rdfs:comment "A placeholder subject used when a project has not yet declared what portion of reality it models. Its presence in iao:isAbout produces a MISSING_REALIST_ANCHOR validation finding." .

`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the Project TBox as Turtle text.
 * Prepend this to any Turtle or N-Triples export
 * (SPEC section 31 items 2 and 4).
 */
export function getProjectTBoxTurtle(): string {
  return PROJECT_TBOX_TURTLE;
}

/**
 * Returns the Project TBox as an array of JSON-LD node objects.
 * Insert into the @graph array of a semantic JSON-LD export
 * (SPEC section 6.3 step 5; entity set defined in section 5.14).
 *
 * Uses compact IRIs resolvable via VMP_CONTEXT (SPEC section 5.2).
 * rdfs:domain and rdfs:range values are compact IRI strings; the
 * consuming semantic-export layer (task 1.4) must extend or supplement
 * VMP_CONTEXT with { "@type": "@id" } entries for those predicates
 * if full IRI expansion is required.
 */
export function getProjectTBoxNodes(): object[] {
  return [
    {
      id: "iao:OntologyDesignPattern",
      type: ["owl:Class"],
      "rdfs:label": "Ontology Design Pattern",
      "rdfs:comment": "An Information Content Entity that represents a portion of reality that is the subject of one or more data points and is encoded in a repeatable machine-interpretable format using elements from an ontology.",
      "rdfs:subClassOf": ["cco:ont00000958"],
    },
    {
      id: "ecm:Project",
      type: ["owl:Class"],
      "rdfs:label": "Visual Modeler Project",
      "rdfs:subClassOf": ["iao:OntologyDesignPattern"],
    },
    {
      id: "ecm:Serialization",
      type: ["owl:Class"],
      "rdfs:label": "Project Serialization",
      "rdfs:comment": "An Information Content Entity that is a concrete encoding of a project (Ontology Design Pattern) in a specific representational format.",
      "rdfs:subClassOf": ["cco:ont00000958"],
    },
    {
      id: "ecm:isSerializationOf",
      type: ["owl:ObjectProperty"],
      "rdfs:label": "is serialization of",
      "rdfs:domain": "ecm:Serialization",
      "rdfs:range": "iao:OntologyDesignPattern",
    },
    {
      id: "ecm:UnspecifiedSubjectMatter",
      type: ["owl:Class"],
      "rdfs:label": "Unspecified Subject Matter",
      "rdfs:comment": "A placeholder subject used when a project has not yet declared what portion of reality it models. Its presence in iao:isAbout produces a MISSING_REALIST_ANCHOR validation finding.",
    },
  ];
}
