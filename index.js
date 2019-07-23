'use strict';

const fs = require('fs');
const yaml = require('js-yaml');
const mongoose = require('mongoose');

/**
 * @description Plugin module
 */
const LinkedModifies = (() => {

  // Options defaults
  const _defaults = {
    config: './config_example/dependencies.yml',
    logicalErase: false
  };

/**
 * @description Plugin function to apply on mongoose
 */
return function _linkedModifies(schema, opts = _defaults) {

  const _file = opts.config;
  const _contents = fs.readFileSync(_file, 'utf8');
  const _data = yaml.load(_contents);

  /**
   * @description Function handler to update one operation
   * @param main
   * @param conditions
   * @param nxt
   * @return {Promise.<*>}
   * @private
   */
  const _updateOneHandler = async function _updateOneHandler(main, conditions, nxt) {
    const _main_model = mongoose.model(main, schema);

    let _main_data = await _main_model.findOne(conditions);

    _main_data = _main_data.toObject();

    await _data[main].map(async linked => {
      const [_collection, _config] = linked;
      const { fields: _fields } = _config;
      const [ _pk, _fk ] = _fields;
      const _pk_data = _main_data && _main_data[_pk];
      const _linked_schema = new mongoose.Schema({
        [_fk] : []
      });
      const _linked_model = mongoose.model(_collection, _linked_schema);
      const _remove = await _linked_model.updateMany({
          [_fk]: { "$in": [_pk_data] }
        },
        {
          $pullAll: { [_fk]: [_pk_data] }
        });

      console.log(_remove, _fk, _pk_data);
    });

    return nxt();
  };

  /**
   * @description Function handler to update many operation
   * @param main
   * @param conditions
   * @param nxt
   * @return {Promise.<*>}
   * @private
   */
  const _updateManyHandler = async function _updateManyHandler(main, conditions, nxt) {
    const _main_model = mongoose.model(main, schema);

    let _main_data = await _main_model.find(conditions);

    await _data[main].map(async linked => {
      const [_collection, _config] = linked;
      const { fields: _fields } = _config;
      const [ _pk, _fk ] = _fields;
      const _linked_schema = new mongoose.Schema({
        [_fk] : []
      });
      const _linked_model = mongoose.model(_collection, _linked_schema);

      await _main_data.map(async d => {
        const _pk_data = d && d[_pk];
        const _remove = await _linked_model.updateMany({
            [_fk]: { "$in": [_pk_data] }
          },
          {
            $pullAll: { [_fk]: [_pk_data] }
          });

        console.log(_remove, _fk, _pk_data);
      });
    });

    return nxt();
  };

  /**
   * @description Function handler to remove one operation
   * @param next
   * @return {Promise.<void>}
   * @private
   */
  const _removeOneHandler = async function _removeOneHandler(next) {
    const _main = this.mongooseCollection.name;
    const _conditions = this._conditions;

    await _updateOneHandler(_main, _conditions, next)
  };

  /**
   * @description Function handler to remove many operation
   * @param next
   * @return {Promise.<void>}
   * @private
   */
  const _removeManyHandler = async function _removeHandler(next) {
    const _main = this.mongooseCollection.name;
    const _conditions = this._conditions;

    await _updateManyHandler(_main, _conditions, next);
  };

  /**
   * @description Function handler to logical erase one operation
   * @param next
   * @return {Promise.<*>}
   * @private
   */
  const _logicalEraseMany = async function _logicalEraseMany(next) {
    const _main = this.mongooseCollection.name;
    const _conditions = this._conditions;
    const _update = this._update;
    const _keys = _update && Object.keys(_update);

    if (!_keys.includes('deleted')) {
      return next();
    }

    await _updateManyHandler(_main, _conditions, next);
  };

  /**
   * @description Function handler to logical erase many operation
   * @param next
   * @return {Promise.<*>}
   * @private
   */
  const _logicalEraseOne = async function _logicalEraseOne(next) {
    const _main = this.mongooseCollection.name;
    const _conditions = this._conditions;
    const _update = this._update;
    const _keys = _update && Object.keys(_update);

    if (!_keys.includes('deleted')) {
      return next();
    }

    await _updateOneHandler(_main, _conditions, next);
  };

  // IF EXIST LOGICAL ERASE OPTION THEN APPLY LOGICAL ERASE OPERATIONS
  if (!opts.logicalErase) {
    schema.pre('deleteMany', { query: true }, _removeManyHandler);
    schema.pre('deleteOne', { query: true }, _removeOneHandler);
  } else {
    schema.pre('updateOne', { query: true }, _logicalEraseOne);
    schema.pre('updateMany', { query: true }, _logicalEraseMany);
  }
};
})();

module.exports = LinkedModifies;