// tslint:disable: no-console
// tslint:disable-next-line: no-unused-expression
import 'reflect-metadata'

import * as _ from 'underscore'
import { StaticThis, RefSchemaType } from './types';
import { Document, Model as MongooseModel, Types } from 'mongoose';
import { ReflectModel, ReflectKey, ReflectDoc, ReflectPivotKey } from './constants/symbols';
import { PropMeta } from './constants/initial';
import { DeleteModel } from './interfaces/delete.interface';
import { Proxify } from './proxy';


/**
 * Future features:
 *  - Autopopulate (Refs) -> FINISHED
 *  - Do Tests -> FINISHED
 *  - Custom Collections. -> FINISHED
 *  - Plugins -> FINISHED
 *  - General Hooks -> FINISHED
 *  - Update Recursive
 *  - Properies edited flag
 *  - Schema Methods -> It's necesary? You can declare method in the class and that's fine.
 *  - Virtuals -> It's necesary? You can declare a getter and setter in the class and that's fine
 *
 *  - MORE:
 *    - Recursive Save
 */
export class Model extends Proxify {

  /**
   * Virutal ID of document
   *
   * @private
   * @type {Types.ObjectId}
   * @memberof Model
   */
  public _id: Types.ObjectId;

  /**
   * Creates an instance of Model with the corresponding metadata.
   * @param {...any[]} data
   * @memberof Model
   */
  constructor(data: object = {}) {
    super();
    this._id = Types.ObjectId();
    Model.assign.call(this, data);
    const children: object = Reflect.getPrototypeOf(this);
    Reflect.defineMetadata(ReflectKey, PropMeta.Key, children);
  }

  /**
   * Key of collection
   *
   * @protected
   * @type {*}
   * @memberof Model
   */
  protected get _key(): string {
    const children: object = Reflect.getPrototypeOf(this);
    return Reflect.getMetadata(ReflectKey, children) as string;
  };

  /**
   * Getter for the virtual _id property
   *
   * @readonly
   * @type {Types.ObjectId}
   * @memberof Model
   */
  public get id(): Types.ObjectId {
    return this._id
  }

  /**
   * Return the Model reference
   *
   * @readonly
   * @private
   * @static
   * @type {MongooseModel<Document>}
   * @memberof Model
   */
  private get _model(): MongooseModel<Document> {
    return Reflect.getMetadata(ReflectModel, this) as MongooseModel<Document>;
  }

  /**
   * Assing all properties to object when this is created.
   *
   * @private
   * @param {object} properties
   * @memberof Model
   */
  private static assign(properties: object): void {
    Object.assign(this, properties);
  }

  /**
   * Set metadata on model
   *
   * @private
   * @param {(string | symbol)} where
   * @param {*} data
   * @param {*} classConstructor
   * @memberof Model
   */
  private setMetadata(where: string | symbol, data: any, classConstructor: any): void {
    Reflect.defineMetadata(where, data, classConstructor);
  }

  /**
   * Get metadata on model
   *
   * @private
   * @param {(string | symbol)} where
   * @param {*} target
   * @returns {void}
   * @memberof Model
   */
  private getMetadata(where: string | symbol, target: any): void {
    return Reflect.getOwnMetadata(where, target);
  }

  /**
   * Execute a fucntion or get a prop value by condicion before and after
   *
   * @private
   * @param {PropMeta} key
   * @param {string} prop
   * @param {boolean} [isFunction=false]
   * @returns
   * @memberof Model
   */
  private doByCondicitonKey(key: PropMeta, prop: string, isFunction: boolean = false) {
    (this as any)[key] = true;
    const result = (this as any)[prop];
    const value = isFunction ? result() : result;
    delete (this as any)[key];
    return value;
  }

  /**
   * Get the KEY from the property without autopopulate.
   *
   * @param {string} prop
   * @returns {RefSchemaType}
   * @memberof Model
   */
  public getId(prop: string): RefSchemaType {
    const key = this.doByCondicitonKey(PropMeta.pivotGetId, prop);

    if (!key)
      return null;

    return key
  }

  /**
   * Parse mongo document to instance of the class
   *
   * @private
   * @static
   * @template T
   * @param {StaticThis<T>} this
   * @param {Document} document
   * @returns {T}
   * @memberof Model
   */
  private static objToClass(obj: object, document: Document): any {
    const keys = _.keys(obj);
    const target = _.extend(obj, _.pick(document.toObject(), keys));
    return target;
  }

  /**
   * Parse mongo document to instance of the class
   *
   * @private
   * @static
   * @template T
   * @param {StaticThis<T>} this
   * @param {Document} document
   * @returns {T}
   * @memberof Model
   */
  private static docToClass(document: Document): any {
    const instance = new this(document.toObject());
    instance._id = document._id;
    Reflect.defineMetadata(ReflectDoc, document, instance);
    return instance;
  }

  /**
   * Parse mongo document array to instance array
   *
   * @private
   * @static
   * @template T
   * @param {StaticThis<T>} this
   * @param {Document[]} documents
   * @returns {T[]}
   * @memberof Model
   */
  private static docsToClass(documents: Document[]): any[] {
    return documents.map(doc => Model.docToClass.call(this, doc));
  }

  /**
   * Create a register of the document in the database and return the instance
   *
   * @static
   * @template T
   * @param {StaticThis<T>} this
   * @param {object} data
   * @returns {Promise<T>}
   * @memberof Model
   */
  public static async create<T extends Model>(this: StaticThis<T>, data: object): Promise<T> {
    try {
      const that = new this(data);
      return await that.save.call(that);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Save/Create a register of the document in the database and return the instance
   *
   * @returns {Promise<this>}
   * @memberof Model
   */
  public async save(): Promise<this> {
    const modelObj = new Model();
    try {
      if (await modelObj.exists.call(this, this.id)) {
        return this.update.call(this);
      } else {
        const doc = await this._model.create({ ...this });
        return Model.objToClass(this, doc);
      }
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   *  Check if this document exist in DB by model key
   *
   * @private
   * @param {*} key
   * @returns {Promise<boolean>}
   * @memberof Model
   */
  private async exists(key: any): Promise<boolean> {
    const query: Record<string, any> = {};
    query[this._key] = key;
    return this._model.exists(query);
  }

  /**
   * Get key
   *
   * @private
   * @param {*} key
   * @returns {object}
   * @memberof Model
   */
  private getQueryKey(key: any): object {
    const query: Record<string, any> = {};
    query[this._key] = key;
    return query;
  }

  /**
   * Return an array of document casted found in database
   *
   * @static
   * @param {object} [query={}]
   * @param {(string | object[] | object)} [populate='']
   * @param {string} [selectFields='']
   * @returns {Promise<this[]>}
   * @memberof Model
   */
  public static async find<T extends Model>(this: StaticThis<T>, query: object = {}, populate: string | object[] | object = '', selectFields: string = ''): Promise<T[]> {
    let documents: Document[];

    const child: T = new this();
    try {
      documents = await child._model
        .find(query)
        .populate(populate)
        .select(selectFields)
        .exec();
    } catch (err) {
      return Promise.reject(err);
    }

    return documents ? Model.docsToClass.call(this, documents) : [];
  }

  /**
   * Return one document from database by ID
   *
   * @static
   * @template T
   * @param {StaticThis<T>} this
   * @param {(string | Types.ObjectId)} id
   * @param {(string | object[] | object)} [populate='']
   * @param {string} [selectFields='']
   * @returns {Promise<T[]>}
   * @memberof Model
   */
  public static async findById<T extends Model>(this: StaticThis<T>, id: string | Types.ObjectId, populate: string | object[] | object = '', selectFields: string = ''): Promise<T> {
    let document: Document;

    const child: T = new this();

    // TODO: PATCH BECAUSE IF I REMOVE THIS, RETURN NULL
    await child._model.findById(id)

    try {
      document = await child._model
        .findById(id)
        .populate(populate)
        .select(selectFields)
        .exec();
    } catch (err) {
      return Promise.reject(err);
    }

    return document ? Model.docToClass.call(this, document) as T : null;
  }

  /**
   * Return one document from database by the query
   *
   * @static
   * @template T
   * @param {StaticThis<T>} this
   * @param {object} [query={}]
   * @param {(string | object[] | object)} [populate='']
   * @param {string} [selectFields='']
   * @returns {Promise<T>}
   * @memberof Model
   */
  public static async findOne<T extends Model>(this: StaticThis<T>, query: object = {}, populate: string | object[] | object = '', selectFields: string = ''): Promise<T> {
    let document: Document;

    const child: T = new this();
    try {
      document = await child._model
        .findOne(query)
        .populate(populate)
        .select(selectFields)
        .exec();
    } catch (err) {
      return Promise.reject(err);
    }

    return document ? Model.docToClass.call(this, document) as T : null;
  }

  /**
   * Update a record in the database and return the instance
   *
   * @param {object} [data]
   * @returns {Promise<this>}
   * @memberof Model
   */
  public async update(data?: object): Promise<this> {
    try {
      const doc = await this._model.findByIdAndUpdate(this.id, data ?? this);
      return Model.objToClass(this, doc);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Delete a docuemnt from DB
   *
   * @returns {Promise<DeleteModel>}
   * @memberof Model
   */
  public async delete(): Promise<DeleteModel> {
    try {
      return await this._model.deleteOne(this.getQueryKey(this.id));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Delete many docuemnt from DB
   *
   * @returns {Promise<DeleteModel>}
   * @memberof Model
   */
  public static async deleteMany<T extends Model>(this: StaticThis<T>, query: object = {}): Promise<DeleteModel> {
    try {
      const that = new this();
      return await that._model.deleteMany(query);
    } catch (err) {
      return Promise.reject(err);
    }
  }
}