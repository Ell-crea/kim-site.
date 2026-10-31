-- ============ Kim — Centre Ivoiro-Coréen : base Snowflake ============
-- À exécuter dans Snowsight (Worksheets) avec un rôle ayant les droits de création.
CREATE DATABASE IF NOT EXISTS KIM_DB;
CREATE SCHEMA   IF NOT EXISTS KIM_DB.CENTRE;
USE SCHEMA KIM_DB.CENTRE;
CREATE WAREHOUSE IF NOT EXISTS KIM_WH WAREHOUSE_SIZE='XSMALL' AUTO_SUSPEND=60 AUTO_RESUME=TRUE INITIALLY_SUSPENDED=TRUE;
USE WAREHOUSE KIM_WH;

-- Catalogue des activités (6 activités simulées)
CREATE OR REPLACE TABLE ACTIVITIES (
  NAME STRING, DESCRIPTION STRING, ICON STRING,
  MIN_AGE NUMBER, MAX_AGE NUMBER, CAPACITY NUMBER, TAKEN NUMBER);
INSERT INTO ACTIVITIES VALUES
 ('Taekwondo débutant','8–14 ans · Mer & Sam','🥋',8,14,12,8),
 ('Initiation numérique','Adultes · Lun & Jeu','💻',18,99,25,19),
 ('Atelier coding jeunes','15–25 ans · mensuel','👨‍💻',15,25,30,22),
 ('Culture coréenne (K-culture)','Tout public · Ven','🎎',0,99,40,27),
 ('Hackathon & événements','Selon calendrier','🚀',0,99,100,60),
 ('Basket loisirs','Tout public · Sam','🏀',0,99,20,11);

-- Toutes les demandes envoyées par le chatbot (kind : room | reg | part | help)
CREATE TABLE IF NOT EXISTS REQUESTS (
  ID STRING DEFAULT UUID_STRING(),
  KIND STRING, STATUS STRING DEFAULT 'wait',           -- wait | ok | ko | help
  NAME STRING, EMAIL STRING, ACTIVITY STRING,
  REQ_DATE STRING, REQ_HOUR STRING, DETAILS STRING, LANG STRING,
  CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP());

-- Planning des salles (à remplir avec le planning fourni par le Centre)
CREATE TABLE IF NOT EXISTS ROOM_SCHEDULE (ROOM STRING, DAY STRING, START_H STRING, END_H STRING, STATUS STRING);

-- Vues par type de demande (pratiques pour la démo et le README)
CREATE OR REPLACE VIEW ROOM_REQUESTS   AS SELECT * FROM REQUESTS WHERE KIND='room';
CREATE OR REPLACE VIEW REGISTRATIONS   AS SELECT * FROM REQUESTS WHERE KIND='reg';
CREATE OR REPLACE VIEW PARTNERSHIPS    AS SELECT * FROM REQUESTS WHERE KIND='part';

-- ============ Authentification de l'API (clé RSA) ============
-- 1) Générer la clé (terminal) :
--    openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out kim_key.p8 -nocrypt
--    openssl rsa -in kim_key.p8 -pubout -out kim_key.pub
-- 2) Coller le contenu de kim_key.pub SANS les lignes BEGIN/END :
-- ALTER USER <VOTRE_UTILISATEUR> SET RSA_PUBLIC_KEY='MIIBIjANBgkqh...';
