declare namespace Chai {

  interface Assertion extends LanguageChains, NumericComparison, TypeComparison {
    properties: (any)=>void;
  }

}
