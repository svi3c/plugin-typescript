import fs = require('fs');
import path = require('path');
import chai = require('chai');
import ts = require('typescript');

import {Resolver} from '../src/resolver';
import {TypeChecker} from '../src/type-checker';
import {CompilerHost} from '../src/compiler-host';
import {formatErrors} from '../src/format-errors';

const should = chai.should();

const missingFile = '/somefolder/fixtures-es6/program1/missing-file.ts';
const missingImport = require.resolve('./fixtures-es6/program1/missing-import.ts');
const syntaxError = require.resolve('./fixtures-es6/program1/syntax-error.ts');
const referenceSyntaxError = require.resolve('./fixtures-es6/program1/ref-syntax-error.ts');
const typeError = require.resolve('./fixtures-es6/program1/type-error.ts');
const nestedTypeError = require.resolve('./fixtures-es6/program1/nested-type-error.ts');
const noImports = require.resolve('./fixtures-es6/program1/no-imports.ts');
const oneImport = require.resolve('./fixtures-es6/program1/one-import.ts');
const ambientReference = require.resolve('./fixtures-es6/ambients/ambient-reference.ts');
const ambientReferenceDisabled = require.resolve('./fixtures-es6/ambients/ambient-reference-disabled.ts');
const nestedReference = require.resolve('./fixtures-es6/ambients/ambient-nested.ts');
const backslashReference = require.resolve('./fixtures-es6/ambients/backslash-reference.ts');
const ambientImportJs = require.resolve('./fixtures-es6/ambients/ambient-import-js.ts');
const ambientImportTs = require.resolve('./fixtures-es6/ambients/ambient-import-ts.ts');
const ambientResolveTs = require.resolve('./fixtures-es6/ambients/ambient-resolve.ts');
const ambientDuplicate = require.resolve('./fixtures-es6/ambients/ambient-duplicate.ts');
const ambientRequires = require.resolve('./fixtures-es6/ambients/ambient-requires.ts');
const refImport = require.resolve('./fixtures-es6/program1/ref-import.ts');
const externalEntry = require.resolve('./fixtures-es6/external/entry.ts');
const circularFile = require.resolve('./fixtures-es6/circular/circular.ts');
const importCss = require.resolve('./fixtures-es6/css/import-css.ts');
const importHtml = require.resolve('./fixtures-es6/html/import-html.ts');
const angular2Typings = require.resolve('./fixtures-es6/typings/angular2-typings.ts');
const rxjsTypings = require.resolve('./fixtures-es6/typings/rxjs-typings.ts');
const missingTypings = require.resolve('./fixtures-es6/typings/missing-typings.ts');
const missingPackage = require.resolve('./fixtures-es6/typings/missing-package.ts');

let filelist = [];
function fetch(filename) {
	//console.log("fetching " + filename);
	filelist.push(filename);
   try {
      return Promise.resolve(fs.readFileSync(filename, 'utf8'));   
   }
   catch (err) {
      return Promise.reject(err);
   }
}

function resolve(dep, parent) {
	//console.log("resolving " + parent + " -> " + dep);
	let result = "";

	try {
      if (dep[0] === '/')
			result = dep;
		else if (dep[0] === '.')
			result = path.join(path.dirname(parent), dep);
		else {
         result = path.join(path.dirname(parent), "resolved", dep);
         
         if (dep.indexOf('/') < 0)
            result = path.join(result, dep);         

         if (dep == "ambient/ambient")
            result = result + ".ts";
            
         if (path.extname(result) == "")
            result = result + ".js";
      }
      
		if (path.extname(result) == "")
			result = result + ".ts";

		//console.log("resolved " + parent + " -> " + result);
		return Promise.resolve((ts as any).normalizePath(result));
	}
	catch (err) {
		console.error(err);
		return Promise.reject(err)
	}
}

describe('TypeChecker', () => {

	let typeChecker;
   let resolver;
	let host;

   async function resolveAll(filelist: string[]) {
      var resolutions = filelist.map((filename) => {
      filename = (ts as any).normalizePath(filename);
         let text = fs.readFileSync(filename, 'utf8');
         host.addFile(filename, text);
         return resolver.resolve(filename);
      });
      
      let resolved = await Promise.all(resolutions);
      const unfetched = resolved.reduce((result, deps) => {
         const files = deps.list.filter(dep => !host.fileExists(dep) && (result.indexOf(dep) < 0));
         return result.concat(files);
      }, []);
            
      if (unfetched.length > 0) {
         await resolveAll(unfetched);
      }
   }
   
	async function typecheckAll(filename: string) {
		resolver.registerDeclarationFile((ts as any).normalizePath(require.resolve(host.getDefaultLibFileName())));
      await resolveAll([filename]);
      var result = typeChecker.check();
      
      if (result.length == 0)
         result = typeChecker.forceCheck();
         
      return result;         
	}

	beforeEach(() => {
		filelist = [];
		host = new CompilerHost({});
		typeChecker = new TypeChecker(host);
      	resolver = new Resolver(host, resolve, fetch);
	});

	it('compiles successfully', async () => {
		let diags = await typecheckAll(noImports);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('uses config options', async () => {
		let options = {
			noImplicitAny: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);

		let diags = await typecheckAll(oneImport);
      diags.should.have.length(1);
      diags[0].code.should.be.equal(7005);
	});

	it('compiles ambient imports', async () => {
		let diags = await typecheckAll(ambientImportJs);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('catches type errors', async () => {
		let diags = await typecheckAll(typeError);
      diags.should.have.length(1);
      diags[0].code.should.be.equal(2322);
	});

	it('only checks full resolved typescript files', async () => {
		let options = {
			noImplicitAny: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);
      host.addFile("declaration.d.ts", "export var a: string = 10;");

      await resolver.resolve("declaration.d.ts");
      let diags = typeChecker.check();
      diags.should.have.length(0);
            
      host.addFile("index.ts", '/// <reference path="declaration.d.ts" />');
      await resolver.resolve("index.ts")
      diags = typeChecker.check(); 
      diags.should.not.have.length(0);                  
	});

	it('handles backslash in references', async () => {
		let diags = await typecheckAll(backslashReference);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('loads nested reference files', async () => {
		let diags = await typecheckAll(nestedReference)
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('catches syntax errors', async () => {
		let diags = await typecheckAll(syntaxError);
      diags.should.have.length(3);
	});

	it('catches syntax errors in reference files', async () => {
		let diags = await typecheckAll(referenceSyntaxError);
      diags.should.have.length(8);
	});

	it('handles ambient references when resolveAmbientRefs option is false', async () => {
		let diags = await typecheckAll(ambientReferenceDisabled);
      diags.should.have.length(0);
	});

	it('resolves ambient references when resolveAmbientRefs option is true', async () => {
		let options = {
			resolveAmbientRefs: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);

		let diags = await typecheckAll(ambientReference);
      diags.should.have.length(0);
	});

	it('handles ambient javascript imports', async () => {
		let diags = await typecheckAll(ambientImportJs);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('handles circular references', async () => {
		let diags = await typecheckAll(circularFile);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('handles ambient typescript imports', async () => {
		let options = {
			resolveAmbientRefs: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);
		
      let diags = await typecheckAll(ambientImportTs);
      diags.should.have.length(0);
	});

	it('resolves ambient typescript imports', async () => {
		let diags = await typecheckAll(ambientResolveTs);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('handles ambients with subset names', async () => {
		let options = {
			resolveAmbientRefs: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);

		let diags = await typecheckAll(ambientDuplicate);
      diags.should.have.length(0);
	});

	it('handles ambients with internal requires', async () => {
		let diags = await typecheckAll(ambientRequires);
      diags.should.have.length(0);
	});

	it('handles external imports', async () => {
		let diags = await typecheckAll(externalEntry);
      diags.should.have.length(0);
	});

	it('imports .css files', async () => {
		let diags = await typecheckAll(importCss);
      diags.should.have.length(0);
	});

	it('imports .html files', async () => {
		let diags = await typecheckAll(importHtml);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('loads lib.d.ts', async () => {
		let options = {
         targetLib: "es5"			
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);
		
		let diags = await typecheckAll(noImports);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});   

   it('resolve typings files when resolveTypings is true', async () => {
		let options = {
			resolveTypings: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);
		
      let diags = await typecheckAll(angular2Typings);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

   it('doesnt resolve typings files when resolveTypings is false', async () => {
		let options = {
			resolveTypings: false
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);

		let diags = await typecheckAll(angular2Typings);
      //formatErrors(diags, console as any);
      diags.should.have.length(1);
      diags[0].code.should.be.equal(2307);
	});

	it('handles missing typings field in package.json', async () => {
		let options = {
			resolveTypings: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);

		let diags = await typecheckAll(missingTypings);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('handles non-relative typings field in package.json', async () => {
		let options = {
			resolveTypings: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);

		let diags = await typecheckAll(rxjsTypings);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

	it('handles package.json not found', async () => {
		let options = {
			resolveTypings: true
		};
		host = new CompilerHost(options);
		typeChecker = new TypeChecker(host);
      resolver = new Resolver(host, resolve, fetch);

		let diags = await typecheckAll(missingPackage);
      formatErrors(diags, console as any);
      diags.should.have.length(0);
	});

});