# Project Title
Webdash

## Description
Your own customizable startup page for your browser, which only displays the links you want it to.<br />
By editing the index.html file, you can choose which links should be used, how they should open, and which category they should belong in.

## Table of Contents
- [Description](#description)
- [Installation](#installation)
- [License](#license)
- [Acknowledgements](#acknowledgements)
- [Contact](#contact)


## Installation
To install and set up the Webdash project, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SladeDK/webdash.git
   cd webdash
   ```

2. **Install dependencies:**
    <br />Make sure you have nginx installed.
    <br /><ins>*NOTE: You can still use the config_www files with other web-engines*</ins>

3. **Move and edit the necessary files:**
    <br />Copy the files from the website-configs into "/var/www/html/" folder.
    ```bash
    sudo rm /var/www/html/index.nginx* -rf

    sudo mv ./config_www/* /var/www/html/.
    ```

    Copy the files from the config_nginx_site-confs into "/etc/nginx/sites-enabled/" folder.
    <br /><ins>*NOTE: Remember to change the subdomain name within the default.conf, to your desired subdomain*</ins>
    ```bash
    sudo rm /etc/nginx/sites-available/* -rf
    sudo rm /etc/nginx/sites-enabled/default -rf

    sudo mv ./config_nginx_site-confs/* /etc/nginx/sites-available/default.conf
    sudo ln -sf /etc/nginx/sites-available/default.conf /etc/nginx/sites-enabled/default.conf
    ```
   
4. **Start Nginx & sites:**
    ```bash
    systemctl enable nginx --now
    nginx -s reload
    ```

5. **Open in browser:**
    <br />Open your browser and navigate to http://web.webdash.dk or http://home.webdash.dk to see your customizable startup pages.
    <br /><ins>*NOTE: If a DNS hasn't been configured to point to the IP of the respective subdomains, you'll have to configure that alternatively you can input the IP of the device instead*</ins>

6. **Edit the index.html file:**
    <br />Customize the index.html file to add your desired links, categories, and how they should open.

## License
Information about the license under which your project is distributed.

## Acknowledgements
Credits to contributors, libraries, or resources that helped with the project.

## Contact
Information on how to contact the project maintainers.
