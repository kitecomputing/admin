import UIKit from 'uikit';
import 'uikit/src/less/uikit.theme.less';

import 'font-awesome/scss/font-awesome.scss';

import './Admin.scss';

import React from 'react';
import ReactDom from 'react-dom';
import TransitionGroup from 'react-transition-group/TransitionGroup';
import CSSTransition from 'react-transition-group/CSSTransition';
import { HashRouter as Router,
         Route, Switch,
         Link } from 'react-router-dom';

import Navbar from './Navbar';

import { UserDialog } from './Users';

import '../static/icons/admin.svg';

const E = React.createElement;

class AppIcon extends React.Component {
    render() {
        return E('div', {className: 'app-tile'},
                 E('a', { href: this.props.appUrl },
                   E('img', { src: this.props.icon })),
                 E('div', {className: 'app-name'},
                   E('a', {href: this.props.appUrl},
                     this.props.name)));
    }
}

class Apps extends React.Component {
    constructor() {
        super()

        this.state = { }
    }

    componentDidMount() {
        fetch('kite+app://admin.flywithkite.com/me/applications',
              { method: 'GET' })
            .then((r) => r.json())
            .then((apps) => { this.setState({apps}) })
            .catch((error) => this.setState({error}))
    }

    render() {
        var apps =
            E(CSSTransition, { timeout: 400, classNames: 'app-tile-message', id: 'loading' },
              E('div', null, "loading..."))

        if ( this.state.apps ) {
            apps = this.state.apps.map(
                (app) =>
                    E(CSSTransition, { timeout: { enter: 500, exit: 100 },
                                       classNames: 'app-tile',
                                       id: app.canonical },
                      E(AppIcon, { icon: app.icon,
                                   name: app.name,
                                   appUrl: app['app-url'],
                                   key: app.canonical })))
        } else if ( this.state.error ) {
            apps = E(CSSTransition, { timeout: 400, classNames: 'app-tile-message', id: 'error' },
                     E('div', null, this.state.error))
        }

        return E('section', { className: 'container app-tiles-container' },
                 E('h2', null, 'Apps'),
                 E(TransitionGroup, {className: 'app-tiles'}, apps))
    }
}

class UserTile extends React.Component {
    render() {
        return E('div', {className: 'user-tile'},
                 this.props.user.display_name,
                 E('div', { className: 'user-tile-attrs'},
                   this.props.superuser ? [ E('i', { className: 'fa fa-fw fa-lock' }) ] : null,
                   E('i', { className: 'fa fa-fw fa-pencil' }),
                   E('i', { className: 'fa fa-fw fa-info-circle' }));
    }
}

class Users extends React.Component {
    constructor () {
        super()

        this.state = { users: null }
    }

    componentDidMount() {
        fetch('kite+app://admin.flywithkite.com/personas',
              { method: 'GET', cache: 'no-store' })
            .then((r) => r.json())
            .then((users) => { this.setState({users}) })
            .catch((error) => this.setState({error}))
    }

    get addUserDialog() {
        if ( this.state.addUser ) {
            return E(UserDialog, { user: null, onClose: () => { this.setState({addUser: false}) } })
        }
    }

    render() {
        var users = E(CSSTransition, {key: 'loading', classNames: 'none', timeout: { enter: 0, exit: 0 }},
                      E('div', null, 'Loading'))

        if ( this.state.error ) {
            users = E(CSSTransition, {}, E('div', null, "Error"))
        } else if ( this.state.users !== null ) {
            users = this.state.users.map(
                (user) =>
                    E(CSSTransition, {timeout: {enter: 500, exit: 100},
                                      classNames: 'user-tile',
                                      key: user.persona_id},
                      E(UserTile, { user: user.persona })))
        }

        return E('section', {className: 'container users-container'},
                 E('h2', null, 'Users',
                   E('ul', { className: 'uk-iconnav'},
                     E('li', {onClick: () => { this.setState({addUser: true}) }},
                       E('a', null, E('i', { className: 'fa fa-plus fa-fw'}))))),
                 this.addUserDialog,
                 E(TransitionGroup, {className: 'users'},
                   users))
    }
}

class MainPage extends React.Component {
    constructor () {
        super()

        this.state = { user: null }
    }

    componentDidMount() {
        fetch("kite+app://admin.flywithkite.com/me",
              { method: 'GET', cache: 'no-store' })
            .then((r) => r.json())
            .then((r) => this.setState({ user: r }))
            .catch((e) => console.error("error fetching info", e))
    }

    render () {
        var extra = null

        if ( this.state.user ) {
            if ( this.state.user.persona.superuser && this.props.inAdminMode )
                extra = [ E(Users) ]
        }

        return [ E(Apps), extra ]
    }
}

export class AdminApp extends React.Component {
    constructor() {
        super()

        this.state = { ourInfo: null, inAdminMode: false }
    }

    componentDidMount () {
        fetch("kite+app://admin.flywithkite.com/me",
              { method: 'GET', cache: 'no-store' })
            .then((r) => {
                if ( r.status == 403 && this.props.onUnauthorized ) {
                    this.props.onUnauthorized()
                } else
                    return r.json().then((r) => this.setState({ourInfo: r}))
            })
    }

    get inAdminMode() {
        return this.state.inAdminMode || this.props.inAdminMode;
    }

    render() {
        var header;

        if ( this.state.ourInfo ) {
            var settingsButton =
                E('div', { className: `uk-icon-button admin-mode-button ${this.inAdminMode ? 'engaged' : ''}`,
                           'uk-tooltip': (this.props.inAdminMode ? 'Connected over local network' : 'Connected remotely. Click to enable admin privileges'),
                           onClick: () => { this.setState({inAdminMode: !this.state.inAdminMode}) } },
                  E('i', { className: `fa fa-fw ${this.inAdminMode ? 'fa-lock' : 'fa-unlock-alt'}` }))

            header = [ this.state.ourInfo.persona.superuser ? settingsButton : null,
                       E('header', { className: 'kite-header' },
		         E('h1', {}, `Welcome ${this.state.ourInfo.persona.display_name}`)) ];
        }

        return E(Router, {},
                 E('div', {},
                   header,

                   E(Route, { path: '/',
                              render: () => E(MainPage, { inAdminMode: this.inAdminMode })})))
    }
}
