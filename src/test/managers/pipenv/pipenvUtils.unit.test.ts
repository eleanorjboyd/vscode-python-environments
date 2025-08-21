import assert from 'assert';
import { parsePipenvList } from '../../../managers/pipenv/pipenvUtils';

suite('Pipenv Package Manager Utils Tests', () => {
    suite('parsePipenvList', () => {
        test('should parse empty output', () => {
            const result = parsePipenvList('');
            assert.deepStrictEqual(result, []);
        });

        test('should parse single package', () => {
            const output = 'requests==2.28.1';
            const result = parsePipenvList(output);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'requests');
            assert.strictEqual(result[0].displayName, 'requests');
            assert.strictEqual(result[0].version, '2.28.1');
        });

        test('should parse multiple packages', () => {
            const output = `requests==2.28.1
certifi==2022.9.24
urllib3==1.26.12`;
            const result = parsePipenvList(output);
            
            assert.strictEqual(result.length, 3);
            assert.strictEqual(result[0].name, 'requests');
            assert.strictEqual(result[1].name, 'certifi');
            assert.strictEqual(result[2].name, 'urllib3');
        });

        test('should ignore headers and separators', () => {
            const output = `Package      Version
------------ ---------
requests     2.28.1
certifi      2022.9.24`;
            const result = parsePipenvList(output);
            
            // Should parse nothing as this is table format, not == format
            assert.strictEqual(result.length, 0);
        });

        test('should handle packages with location info', () => {
            const output = 'requests==2.28.1    /path/to/site-packages';
            const result = parsePipenvList(output);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'requests');
            assert.strictEqual(result[0].version, '2.28.1');
            assert.strictEqual(result[0].location, '/path/to/site-packages');
        });

        test('should handle complex package names', () => {
            const output = `django-rest-framework==3.14.0
Pillow==9.2.0`;
            const result = parsePipenvList(output);
            
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'django-rest-framework');
            assert.strictEqual(result[1].name, 'Pillow');
        });
    });
});